//! Object Selection: interactive segmentation by iterated graph cuts.
//!
//! Adapted from PhotoCraft's `photocraft-algo` segmentation module (MIT; see
//! `LICENSE-photocraft`), reduced to what Object Selection needs and made single-threaded.
//! Everything here is classical (no learned models) and implemented from the published papers:
//!
//! * [`maxflow`]: Boykov–Kolmogorov min-cut / max-flow (Boykov & Kolmogorov, "An Experimental
//!   Comparison of Min-Cut/Max-Flow Algorithms for Energy Minimization in Vision", PAMI 2004).
//! * [`gmm`]: Gaussian mixture colour models (k-means++ initialisation, Arthur & Vassilvitskii
//!   2007; EM refinement).
//! * [`grabcut`]: GrabCut (Rother, Kolmogorov & Blake, SIGGRAPH 2004): iterated graph cuts
//!   (Boykov & Jolly, ICCV 2001) with GMM colour models.
//!
//! Large images are processed at a reduced working resolution and the boundary is then re-cut
//! at full resolution in a narrow band, tile by tile.
//!
//! Colour analysis runs on straight RGB samples in `0..=1` read through a [`Sampler`]; results
//! are 8-bit coverage [`Region`]s.

pub mod gmm;
pub mod grabcut;
pub mod maxflow;

mod edge_starts;

use crate::geom::Rect;
use gmm::Gmm;
use maxflow::Graph;

/// A selection: 8-bit coverage over `bbox`, row-major.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Region {
    pub bbox: Rect,
    pub mask: Vec<u8>,
}

impl Region {
    /// Coverage (0–1) at document pixel `(x, y)`; zero outside the box.
    pub fn at(&self, x: i32, y: i32) -> f32 {
        if !self.bbox.contains(x, y) {
            return 0.0;
        }
        let i = (y.abs_diff(self.bbox.y0) as usize) * self.bbox.width() as usize + x.abs_diff(self.bbox.x0) as usize;
        self.mask.get(i).copied().unwrap_or(0) as f32 / 255.0
    }
}

/// Row-major RGB image, samples in `0..=1`.
#[derive(Clone, Debug, PartialEq)]
pub struct RgbImage {
    pub w: usize,
    pub h: usize,
    pub px: Vec<[f32; 3]>,
}

impl RgbImage {
    pub fn new(w: usize, h: usize) -> Self {
        Self { w, h, px: vec![[0.0; 3]; w * h] }
    }
    pub fn from_fn(w: usize, h: usize, mut f: impl FnMut(usize, usize) -> [f32; 3]) -> Self {
        let mut px = Vec::with_capacity(w * h);
        for y in 0..h {
            for x in 0..w {
                px.push(f(x, y));
            }
        }
        Self { w, h, px }
    }
    #[inline]
    pub fn at(&self, x: usize, y: usize) -> [f32; 3] {
        self.px[y * self.w + x]
    }
    /// Straight RGBA to RGB, compositing transparent pixels over mid gray (so transparency is a
    /// colour the models can separate).
    pub fn from_rgba(px: &[[f32; 4]], w: usize, h: usize) -> Self {
        let px = px
            .iter()
            .take(w * h)
            .map(|p| {
                let a = p[3].clamp(0.0, 1.0);
                [0, 1, 2].map(|c| p[c].clamp(0.0, 1.0) * a + 0.5 * (1.0 - a))
            })
            .collect();
        Self { w, h, px }
    }
    /// Box-average downsampling by an integer `step` (output `ceil(w/step) × ceil(h/step)`).
    pub fn downsample(&self, step: usize) -> RgbImage {
        if step <= 1 {
            return self.clone();
        }
        let (ow, oh) = (self.w.div_ceil(step), self.h.div_ceil(step));
        let mut out = RgbImage::new(ow, oh);
        for oy in 0..oh {
            for ox in 0..ow {
                let mut acc = [0.0f32; 3];
                let mut n = 0.0;
                for y in oy * step..((oy + 1) * step).min(self.h) {
                    for x in ox * step..((ox + 1) * step).min(self.w) {
                        let p = self.at(x, y);
                        for c in 0..3 {
                            acc[c] += p[c];
                        }
                        n += 1.0;
                    }
                }
                out.px[oy * ow + ox] = acc.map(|v| v / n);
            }
        }
        out
    }
}

/// Where the segmentation algorithms read colours from (the canvas, a test image).
pub trait Sampler {
    /// Straight RGBA (`0..=1`) over `r` (document pixels), row-major.
    fn rgba(&self, r: Rect) -> Vec<[f32; 4]>;

    /// RGB over `r` at full resolution.
    fn rgb(&self, r: Rect) -> RgbImage {
        RgbImage::from_rgba(&self.rgba(r), r.width() as usize, r.height() as usize)
    }

    /// RGB over `r`, box-downsampled by `step`, read in horizontal strips so the
    /// full-resolution area is never held in memory as floats at once.
    fn rgb_scaled(&self, r: Rect, step: usize) -> RgbImage {
        if step <= 1 {
            return self.rgb(r);
        }
        let (w, h) = (r.width() as usize, r.height() as usize);
        let (ow, oh) = (w.div_ceil(step), h.div_ceil(step));
        let rows_per = (64usize.div_ceil(step)).max(1);
        let mut px = Vec::with_capacity(ow * oh);
        for si in 0..oh.div_ceil(rows_per) {
            let oy0 = si * rows_per;
            let oy1 = (oy0 + rows_per).min(oh);
            let y0 = r.y0 + (oy0 * step) as i32;
            let y1 = (r.y0 + (oy1 * step) as i32).min(r.y1);
            px.extend(self.rgb(Rect::new(r.x0, y0, r.x1, y1)).downsample(step).px);
        }
        RgbImage { w: ow, h: oh, px }
    }

    /// Straight RGBA (`0..=1`) over `r`, box-downsampled by `step` like [`Self::rgb_scaled`].
    /// Unlike [`Self::rgb`], alpha survives, so a transparent working pixel stays transparent
    /// instead of becoming mid grey: the Object Finder needs that to stop at transparency.
    fn rgba_scaled(&self, r: Rect, step: usize) -> Vec<[f32; 4]> {
        if step <= 1 {
            return self.rgba(r);
        }
        let (w, h) = (r.width() as usize, r.height() as usize);
        let (ow, oh) = (w.div_ceil(step), h.div_ceil(step));
        let rows_per = (64usize.div_ceil(step)).max(1);
        let mut px = Vec::with_capacity(ow * oh);
        for si in 0..oh.div_ceil(rows_per) {
            let oy0 = si * rows_per;
            let oy1 = (oy0 + rows_per).min(oh);
            let y0 = r.y0 + (oy0 * step) as i32;
            let y1 = (r.y0 + (oy1 * step) as i32).min(r.y1);
            let strip = self.rgba(Rect::new(r.x0, y0, r.x1, y1));
            px.extend(downsample_rgba(&strip, w, (y1 - y0) as usize, step));
        }
        px
    }
}

/// Box-average straight RGBA by an integer `step` (`ceil(w/step) × ceil(h/step)`).
fn downsample_rgba(px: &[[f32; 4]], w: usize, h: usize, step: usize) -> Vec<[f32; 4]> {
    let (ow, oh) = (w.div_ceil(step), h.div_ceil(step));
    let mut out = vec![[0.0f32; 4]; ow * oh];
    for oy in 0..oh {
        for ox in 0..ow {
            let mut acc = [0.0f32; 4];
            let mut n = 0.0f32;
            for y in oy * step..((oy + 1) * step).min(h) {
                for x in ox * step..((ox + 1) * step).min(w) {
                    if let Some(p) = px.get(y * w + x) {
                        for c in 0..4 {
                            acc[c] += p[c];
                        }
                        n += 1.0;
                    }
                }
            }
            if let Some(o) = out.get_mut(oy * ow + ox) {
                *o = acc.map(|v| v / n.max(1.0));
            }
        }
    }
    out
}

/// Samples a straight (unpremultiplied) 8-bit RGBA buffer, as `ImageData` holds it, placed at
/// the origin. Pixels outside it read as transparent black.
pub struct Rgba8Sampler<'a> {
    pub data: &'a [u8],
    pub w: usize,
    pub h: usize,
}

impl Sampler for Rgba8Sampler<'_> {
    fn rgba(&self, r: Rect) -> Vec<[f32; 4]> {
        let mut out = Vec::with_capacity(r.width() as usize * r.height() as usize);
        for y in r.y0..r.y1 {
            for x in r.x0..r.x1 {
                let inside = x >= 0 && y >= 0 && (x as usize) < self.w && (y as usize) < self.h;
                let i = if inside { (y as usize * self.w + x as usize) * 4 } else { usize::MAX };
                match self.data.get(i..i.saturating_add(4)) {
                    Some(p) => out.push([p[0], p[1], p[2], p[3]].map(|v| f32::from(v) / 255.0)),
                    None => out.push([0.0; 4]),
                }
            }
        }
        out
    }
}

/// Samples an in-memory RGB image placed at `origin` (tests, benchmarks).
pub struct ImageSampler<'a> {
    pub img: &'a RgbImage,
    pub origin: (i32, i32),
}

impl Sampler for ImageSampler<'_> {
    fn rgba(&self, r: Rect) -> Vec<[f32; 4]> {
        let mut out = Vec::with_capacity(r.width() as usize * r.height() as usize);
        for y in r.y0..r.y1 {
            for x in r.x0..r.x1 {
                let (ix, iy) = (x - self.origin.0, y - self.origin.1);
                if ix < 0 || iy < 0 || ix as usize >= self.img.w || iy as usize >= self.img.h {
                    out.push([0.0; 4]);
                } else {
                    let p = self.img.at(ix as usize, iy as usize);
                    out.push([p[0], p[1], p[2], 1.0]);
                }
            }
        }
        out
    }
}

/// Integer working-resolution step so that `area` holds at most about `max_px` pixels.
pub fn scale_for(area: Rect, max_px: usize) -> usize {
    let n = area.width() as f64 * area.height() as f64;
    ((n / max_px.max(1) as f64).sqrt().ceil() as usize).max(1)
}

#[inline]
fn d2(a: [f32; 3], b: [f32; 3]) -> f32 {
    let (x, y, z) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    x * x + y * y + z * z
}

/// The 4 forward neighbour offsets of an 8-connected grid and their lengths.
const NB: [(i32, i32, f32); 4] = [(1, 0, 1.0), (0, 1, 1.0), (1, 1, std::f32::consts::SQRT_2), (-1, 1, std::f32::consts::SQRT_2)];

/// GrabCut's contrast parameter: `β = 1 / (2 ⟨‖z_m − z_n‖²⟩)` over 8-neighbour pairs.
pub fn contrast_beta(img: &RgbImage) -> f32 {
    let (w, h) = (img.w as i32, img.h as i32);
    let mut sum = 0.0f64;
    let mut n = 0u64;
    for y in 0..h {
        for x in 0..w {
            let a = img.px[(y * w + x) as usize];
            for (dx, dy, _) in NB {
                let (nx, ny) = (x + dx, y + dy);
                if nx >= 0 && nx < w && ny < h {
                    sum += d2(a, img.px[(ny * w + nx) as usize]) as f64;
                    n += 1;
                }
            }
        }
    }
    if n == 0 || sum <= 1e-12 { 0.0 } else { (n as f64 / (2.0 * sum)) as f32 }
}

/// Pixel label constraint for [`grid_cut`].
pub const FREE: u8 = 0;
pub const HARD_FG: u8 = 1;
pub const HARD_BG: u8 = 2;

/// Binary labelling of a grid by one min cut (Boykov & Jolly 2001):
/// minimises `Σ D_p(l_p) + Σ_{p~q} [l_p ≠ l_q] γ e^{-β‖z_p−z_q‖²} / dist(p,q)` over the
/// 8-connected grid. `cost_fg[i]` / `cost_bg[i]` are the data costs of labelling pixel `i`
/// foreground / background; `fixed[i]` is [`FREE`], [`HARD_FG`] or [`HARD_BG`]. Only free pixels
/// become graph nodes (links to fixed neighbours fold into terminal capacities). Returns
/// `true` for foreground.
pub fn grid_cut(img: &RgbImage, cost_fg: &[f32], cost_bg: &[f32], fixed: &[u8], gamma: f32, beta: f32) -> Vec<bool> {
    grid_cut_with(img, cost_fg, cost_bg, fixed, |d2| gamma * (-beta * d2).exp())
}

/// [`grid_cut`] with any edge weight: separating neighbours costs `weight(‖z_p−z_q‖²) / dist(p,q)`.
pub fn grid_cut_with(img: &RgbImage, cost_fg: &[f32], cost_bg: &[f32], fixed: &[u8], weight: impl Fn(f32) -> f32) -> Vec<bool> {
    let (w, h) = (img.w as i32, img.h as i32);
    let Some(n) = img.w.checked_mul(img.h).filter(|&n| n < u32::MAX as usize - 2) else { return Vec::new() };
    if img.w > i32::MAX as usize || img.h > i32::MAX as usize || [img.px.len(), cost_fg.len(), cost_bg.len(), fixed.len()].iter().any(|&len| len < n) {
        return Vec::new();
    }
    let mut free = Vec::new();
    let mut idx = vec![u32::MAX; n];
    let mut count = 0u32;
    for i in 0..n {
        if fixed[i] == FREE {
            idx[i] = count;
            count += 1;
        }
    }
    let mut out: Vec<bool> = fixed.iter().map(|f| *f == HARD_FG).collect();
    if count == 0 {
        return out;
    }
    let mut g = Graph::with_capacity(count as usize, count as usize * 4);
    for i in 0..n {
        if idx[i] != u32::MAX {
            g.add_tweights(idx[i] as usize, cost_bg[i], cost_fg[i]);
        }
    }
    let use_sparse = (count as usize) < n / 8;
    if use_sparse {
        free.extend((0..n).filter(|&i| idx[i] != u32::MAX))
    }
    let mut visit = |i: usize, x: i32, y: i32| {
        let a = img.px[i];
        for (dx, dy, len) in NB {
            let (nx, ny) = (x + dx, y + dy);
            if nx < 0 || nx >= w || ny >= h {
                continue;
            }
            let j = (ny as usize) * img.w + nx as usize;
            if idx[i] == u32::MAX && idx[j] == u32::MAX {
                continue;
            }
            let wt = weight(d2(a, img.px[j])) / len;
            match (idx[i] != u32::MAX, idx[j] != u32::MAX) {
                (true, true) => g.add_edge(idx[i] as usize, idx[j] as usize, wt, wt),
                (true, false) => add_fixed_link(&mut g, idx[i] as usize, fixed[j], wt),
                (false, true) => add_fixed_link(&mut g, idx[j] as usize, fixed[i], wt),
                (false, false) => {}
            }
        }
    };
    if use_sparse {
        for i in edge_starts::Starts::new(&free, img.w) {
            visit(i, (i % img.w) as i32, (i / img.w) as i32);
        }
    } else {
        for y in 0..h {
            for x in 0..w {
                visit((y as usize) * img.w + x as usize, x, y)
            }
        }
    }
    g.maxflow();
    for i in 0..n {
        if idx[i] != u32::MAX {
            out[i] = g.in_source(idx[i] as usize);
        }
    }
    out
}

fn add_fixed_link(g: &mut Graph, node: usize, fixed: u8, wt: f32) {
    if fixed == HARD_FG {
        // Labelling `node` background cuts the link.
        g.add_tweights(node, wt, 0.0);
    } else {
        g.add_tweights(node, 0.0, wt);
    }
}

/// Data costs `(−ln p(z|fg), −ln p(z|bg))` for every pixel.
pub fn data_costs(img: &RgbImage, fg: &Gmm, bg: &Gmm) -> (Vec<f32>, Vec<f32>) {
    img.px.iter().map(|p| (fg.neg_log(*p), bg.neg_log(*p))).unzip()
}

/// Labels 8-connected components of `mask`; returns (labels with 0 = background, sizes indexed by label).
pub fn components(mask: &[bool], w: usize, h: usize) -> (Vec<u32>, Vec<usize>) {
    let mut lab = vec![0u32; w * h];
    let mut sizes = vec![0usize];
    let mut stack = Vec::new();
    for s in 0..w * h {
        if !mask[s] || lab[s] != 0 {
            continue;
        }
        let l = sizes.len() as u32;
        sizes.push(0);
        lab[s] = l;
        stack.push(s);
        while let Some(i) = stack.pop() {
            sizes[l as usize] += 1;
            let (x, y) = ((i % w) as i32, (i / w) as i32);
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    let j = ny as usize * w + nx as usize;
                    if mask[j] && lab[j] == 0 {
                        lab[j] = l;
                        stack.push(j);
                    }
                }
            }
        }
    }
    (lab, sizes)
}

/// Keeps the connected components of `mask` that contain a `seed` pixel.
pub fn keep_seeded(mask: &[bool], seeds: &[bool], w: usize, h: usize) -> Vec<bool> {
    let (lab, sizes) = components(mask, w, h);
    let mut keep = vec![false; sizes.len()];
    for (l, s) in lab.iter().zip(seeds) {
        if *s && *l != 0 {
            keep[*l as usize] = true;
        }
    }
    lab.iter().map(|l| keep[*l as usize] && *l != 0).collect()
}

/// Keeps components at least `frac` of the largest one and fills holes (4-connected background
/// areas not touching the border) smaller than `hole_frac` of the kept area.
pub fn clean_mask(mask: &[bool], w: usize, h: usize, frac: f32, hole_frac: f32) -> Vec<bool> {
    let (lab, sizes) = components(mask, w, h);
    let largest = sizes.iter().skip(1).copied().max().unwrap_or(0);
    if largest == 0 {
        return vec![false; w * h];
    }
    let min = (largest as f32 * frac).ceil() as usize;
    let mut out: Vec<bool> = lab.iter().map(|l| *l != 0 && sizes[*l as usize] >= min).collect();
    let area = out.iter().filter(|v| **v).count();
    let max_hole = (area as f32 * hole_frac) as usize;
    let inv: Vec<bool> = out.iter().map(|v| !v).collect();
    let (hl, hs) = components4(&inv, w, h);
    let touches = border_labels(&hl, hs.len(), w, h);
    for (o, l) in out.iter_mut().zip(&hl) {
        if *l != 0 && !touches[*l as usize] && hs[*l as usize] <= max_hole {
            *o = true;
        }
    }
    out
}

/// Which labels of `labels` (`w` × `h`, `count` labels) reach the image border.
fn border_labels(labels: &[u32], count: usize, w: usize, h: usize) -> Vec<bool> {
    let mut touches = vec![false; count];
    for x in 0..w {
        touches[labels[x] as usize] = true;
        touches[labels[(h - 1) * w + x] as usize] = true;
    }
    for y in 0..h {
        touches[labels[y * w] as usize] = true;
        touches[labels[y * w + w - 1] as usize] = true;
    }
    touches
}

/// Fills the holes of `mask` (4-connected background areas not touching the border) by what
/// they look like: a hole up to `speck_frac` of the mask's area always fills; a larger one, up
/// to `hole_frac`, only when its pixels fit the foreground model `fg` better than `bg` on
/// average, so an enclosed patch of backdrop stays open.
pub fn fill_holes_by_model(mask: &[bool], img: &RgbImage, fg: &Gmm, bg: &Gmm, speck_frac: f32, hole_frac: f32) -> Vec<bool> {
    let (w, h) = (img.w, img.h);
    let mut out = mask.to_vec();
    let area = out.iter().filter(|v| **v).count();
    let max_speck = (area as f32 * speck_frac) as usize;
    let max_hole = (area as f32 * hole_frac) as usize;
    let inv: Vec<bool> = out.iter().map(|v| !v).collect();
    let (hl, hs) = components4(&inv, w, h);
    let touches = border_labels(&hl, hs.len(), w, h);
    // Summed data costs per hole; only holes small enough to be candidates are evaluated.
    let mut cost = vec![(0.0f64, 0.0f64); hs.len()];
    for (i, l) in hl.iter().enumerate() {
        let l = *l as usize;
        if l == 0 || touches[l] || hs[l] > max_hole || hs[l] <= max_speck {
            continue;
        }
        if let Some(p) = img.px.get(i) {
            cost[l].0 += f64::from(fg.neg_log(*p));
            cost[l].1 += f64::from(bg.neg_log(*p));
        }
    }
    for (o, l) in out.iter_mut().zip(&hl) {
        let l = *l as usize;
        if l == 0 || touches[l] || hs[l] > max_hole {
            continue;
        }
        if hs[l] <= max_speck || cost[l].0 <= cost[l].1 {
            *o = true;
        }
    }
    out
}

fn components4(mask: &[bool], w: usize, h: usize) -> (Vec<u32>, Vec<usize>) {
    let mut lab = vec![0u32; w * h];
    let mut sizes = vec![0usize];
    let mut stack = Vec::new();
    for s in 0..w * h {
        if !mask[s] || lab[s] != 0 {
            continue;
        }
        let l = sizes.len() as u32;
        sizes.push(0);
        lab[s] = l;
        stack.push(s);
        while let Some(i) = stack.pop() {
            sizes[l as usize] += 1;
            let (x, y) = (i % w, i / w);
            let n = [(x > 0).then(|| i - 1), (x + 1 < w).then(|| i + 1), (y > 0).then(|| i - w), (y + 1 < h).then(|| i + w)];
            for j in n.into_iter().flatten() {
                if mask[j] && lab[j] == 0 {
                    lab[j] = l;
                    stack.push(j);
                }
            }
        }
    }
    (lab, sizes)
}

/// Softens a hard 0/255 mask's edges: edge pixels blend with their 3×3 neighbourhood.
pub fn antialias_u8(mask: &mut [u8], w: usize, h: usize) {
    let src = mask.to_vec();
    // A span whose 3×3 neighbourhood holds one value has no edge pixel, so it is only compared:
    // most of a full-resolution mask is far from its boundary.
    const SPAN: usize = 64;
    let uniform = |y: usize, x0: usize, x1: usize| {
        let (a, b, v) = (x0.saturating_sub(1), (x1 + 1).min(w), src[y * w + x0]);
        (y.saturating_sub(1)..(y + 2).min(h)).all(|ny| src[ny * w + a..ny * w + b].iter().all(|n| *n == v))
    };
    for (y, out) in mask.chunks_mut(w.max(1)).enumerate() {
        for (c, span) in out.chunks_mut(SPAN).enumerate() {
            let x0 = c * SPAN;
            if uniform(y, x0, x0 + span.len()) {
                continue;
            }
            for (i, o) in span.iter_mut().enumerate() {
                if let Some(v) = edge_value(&src, w, h, x0 + i, y) {
                    *o = v;
                }
            }
        }
    }
}

/// The anti-aliased value of pixel `(x, y)` of `src` (`w` × `h`), or `None` when every neighbour
/// in its 3×3 neighbourhood has its value (neighbours outside the mask count as the pixel itself).
fn edge_value(src: &[u8], w: usize, h: usize, x: usize, y: usize) -> Option<u8> {
    let v = src[y * w + x];
    let mut sum = 0u32;
    let mut edge = false;
    for dy in -1..=1 {
        for dx in -1..=1 {
            let (nx, ny) = (x as i32 + dx, y as i32 + dy);
            let n = if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 { v } else { src[ny as usize * w + nx as usize] };
            edge |= n != v;
            sum += n as u32;
        }
    }
    edge.then(|| {
        let avg = sum as f32 / (9.0 * 255.0);
        let f = if v > 127 { 0.5 + 0.5 * avg } else { 0.5 * avg };
        (f * 255.0).round() as u8
    })
}

/// Shrinks a region's box to its non-zero pixels (`None` if empty).
pub fn trim_region(r: Region) -> Option<Region> {
    let w = r.bbox.width() as usize;
    if w == 0 {
        return None;
    }
    let h = r.mask.len() / w;
    let (mut x0, mut y0, mut x1, mut y1) = (usize::MAX, usize::MAX, 0, 0);
    for y in 0..h {
        let row = &r.mask[y * w..(y + 1) * w];
        if let (Some(a), Some(b)) = (row.iter().position(|v| *v != 0), row.iter().rposition(|v| *v != 0)) {
            x0 = x0.min(a);
            x1 = x1.max(b + 1);
            y0 = y0.min(y);
            y1 = y + 1;
        }
    }
    if x0 == usize::MAX {
        return None;
    }
    if (x0, y0, x1, y1) == (0, 0, w, h) {
        return Some(r);
    }
    let nw = x1 - x0;
    let mut mask = Vec::with_capacity(nw * (y1 - y0));
    for y in y0..y1 {
        mask.extend_from_slice(&r.mask[y * w + x0..y * w + x1]);
    }
    let b = r.bbox;
    Some(Region { bbox: Rect::new(b.x0 + x0 as i32, b.y0 + y0 as i32, b.x0 + x1 as i32, b.y0 + y1 as i32), mask })
}

/// Turns a working-resolution labelling over `window` (sampled with `step`) into a full-resolution
/// region. With `step > 1` the boundary is re-cut at full resolution in a band about `step`
/// pixels wide around the upsampled boundary, using the given colour models, tile by tile.
/// The result is anti-aliased by one pixel.
pub fn finish_region(sampler: &dyn Sampler, window: Rect, step: usize, low: &[bool], lw: usize, lh: usize, models: Option<(&Gmm, &Gmm)>) -> Option<Region> {
    let (w, h) = (window.width() as usize, window.height() as usize);
    let mut mask = vec![0u8; w * h];
    if step <= 1 {
        for (m, l) in mask.iter_mut().zip(low) {
            *m = if *l { 255 } else { 0 };
        }
    } else {
        // Band blocks: working pixels with a differently labelled pixel within one block.
        let mut band = vec![false; lw * lh];
        for y in 0..lh {
            for x in 0..lw {
                let v = low[y * lw + x];
                'n: for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        let (nx, ny) = (x as i32 + dx, y as i32 + dy);
                        if nx >= 0 && ny >= 0 && (nx as usize) < lw && (ny as usize) < lh && low[ny as usize * lw + nx as usize] != v {
                            band[y * lw + x] = true;
                            break 'n;
                        }
                    }
                }
            }
        }
        for (y, row) in mask.chunks_mut(w.max(1)).enumerate() {
            let ly = (y / step).min(lh - 1);
            for (x, o) in row.iter_mut().enumerate() {
                *o = if low[ly * lw + (x / step).min(lw - 1)] { 255 } else { 0 };
            }
        }
        if let Some((fg, bg)) = models {
            refine_band(sampler, window, step, low, &band, lw, lh, fg, bg, &mut mask);
        }
    }
    antialias_u8(&mut mask, w, h);
    trim_region(Region { bbox: window, mask })
}

/// Full-resolution graph cut restricted to the band blocks (see [`finish_region`]).
#[allow(clippy::too_many_arguments)]
fn refine_band(sampler: &dyn Sampler, window: Rect, step: usize, low: &[bool], band: &[bool], lw: usize, lh: usize, fg: &Gmm, bg: &Gmm, mask: &mut [u8]) {
    const T: i32 = 192;
    const HALO: i32 = 12;
    let w = window.width() as usize;
    let block = |x: i32, y: i32| -> usize { ((y - window.y0) as usize / step).min(lh - 1) * lw + ((x - window.x0) as usize / step).min(lw - 1) };
    let mut ty = window.y0;
    while ty < window.y1 {
        let mut tx = window.x0;
        while tx < window.x1 {
            let t = Rect::new(tx, ty, (tx + T).min(window.x1), (ty + T).min(window.y1));
            tx += T;
            // Any band block overlapping the tile?
            let (bx0, by0) = ((t.x0 - window.x0) as usize / step, (t.y0 - window.y0) as usize / step);
            let (bx1, by1) = (((t.x1 - 1 - window.x0) as usize / step).min(lw - 1), ((t.y1 - 1 - window.y0) as usize / step).min(lh - 1));
            if !(by0..=by1).any(|by| (bx0..=bx1).any(|bx| band[by * lw + bx])) {
                continue;
            }
            let r = t.inflate(HALO).intersect(&window);
            let img = sampler.rgb(r);
            let (rw, rh) = (r.width() as usize, r.height() as usize);
            let mut fixed = vec![FREE; rw * rh];
            let mut cfg = vec![0.0f32; rw * rh];
            let mut cbg = vec![0.0f32; rw * rh];
            for yy in 0..rh {
                for xx in 0..rw {
                    let i = yy * rw + xx;
                    let b = block(r.x0 + xx as i32, r.y0 + yy as i32);
                    let lab = low[b];
                    if !band[b] {
                        fixed[i] = if lab { HARD_FG } else { HARD_BG };
                        continue;
                    }
                    let p = img.px[i];
                    // Colour likelihoods plus a weak prior towards the working-resolution label.
                    cfg[i] = fg.neg_log(p) + if lab { 0.0 } else { 0.4 };
                    cbg[i] = bg.neg_log(p) + if lab { 0.4 } else { 0.0 };
                }
            }
            let beta = contrast_beta(&img);
            let cut = grid_cut(&img, &cfg, &cbg, &fixed, 50.0, beta);
            if cut.len() < rw * rh {
                continue;
            }
            let (cw, ch) = (t.width() as usize, t.height() as usize);
            for yy in 0..ch {
                let sy = (t.y0 - r.y0) as usize + yy;
                let sx = (t.x0 - r.x0) as usize;
                let o = (t.y0 - window.y0) as usize * w + yy * w + (t.x0 - window.x0) as usize;
                for (m, v) in mask[o..o + cw].iter_mut().zip(&cut[sy * rw + sx..sy * rw + sx + cw]) {
                    *m = if *v { 255 } else { 0 };
                }
            }
        }
        ty += T;
    }
}

/// Deterministic pseudo-random numbers (xorshift) for sampling and tests.
#[derive(Clone, Debug)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    /// Uniform in `[0, 1)`.
    pub fn f32(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }
    /// Standard normal (Box–Muller).
    pub fn normal(&mut self) -> f32 {
        let u = self.f32().max(1e-7);
        let v = self.f32();
        (-2.0 * u.ln()).sqrt() * (std::f32::consts::TAU * v).cos()
    }
}

/// Every `k`-th element so that at most `max` remain.
pub fn subsample<T: Copy>(v: &[T], max: usize) -> Vec<T> {
    if v.len() <= max {
        return v.to_vec();
    }
    let k = v.len().div_ceil(max);
    v.iter().step_by(k).copied().collect()
}

/// sRGB (`0..=1`) to CIELAB (D65), L in `0..=100`.
pub fn rgb_to_lab(c: [f32; 3]) -> [f32; 3] {
    let lin = |v: f32| if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    let x = (0.412_456_4 * r + 0.357_576_1 * g + 0.180_437_5 * b) / 0.950_47;
    let y = 0.212_672_9 * r + 0.715_152_2 * g + 0.072_175 * b;
    let z = (0.019_333_9 * r + 0.119_192 * g + 0.950_304_1 * b) / 1.088_83;
    let f = |t: f32| if t > 0.008_856 { t.cbrt() } else { 7.787 * t + 16.0 / 116.0 };
    let (fx, fy, fz) = (f(x), f(y), f(z));
    [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
}

#[cfg(test)]
mod tests;
