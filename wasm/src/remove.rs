//! The Remove Tool: fill what a brush stroke painted over from its surroundings.
//!
//! Adapted from PhotoCraft's `photocraft-algo` and its `paint.remove` command (MIT; see
//! `LICENSE-photocraft`), single-threaded and without cancellation.
//!
//! * [`close_loops`]: a stroke drawn around an object also removes what it encloses (every pixel
//!   that can't reach the grid's border without crossing the stroke).
//! * [`dilate`]: the hole grows by a few pixels so an object's soft edge and halo go with it.
//! * [`remove`]: the hole is completed by [`nonlocal::complete`] (patch-based, with texture
//!   features so the fill keeps the grain of its surroundings, thin wires included).
//! * [`hole_radius`]: how thick a hole is, which sets how many scales the completion uses.
//! * [`remove_rgba8`]: all of it on an 8-bit RGBA image, as the app calls it.
//!
//! Buffers are interleaved `w × h × ch` normalised floats with `w × h` masks; deterministic.

pub mod nonlocal;
pub mod poisson;
mod square_dilate;

use crate::geom::Rect;
use nonlocal::{Params, complete};
use poisson::membrane_fill;

/// Deterministic 64-bit generator (SplitMix64).
pub(crate) struct Rng(u64);

impl Rng {
    /// A generator whose sequence is fixed by `seed`.
    pub(crate) fn new(seed: u64) -> Self {
        Rng(seed ^ 0x9E37_79B9_7F4A_7C15)
    }
    /// The next value of the SplitMix64 sequence.
    pub(crate) fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Uniform integer in `lo..=hi`.
    pub(crate) fn range(&mut self, lo: i32, hi: i32) -> i32 {
        if hi <= lo {
            return lo;
        }
        lo + (self.next() % (hi - lo + 1) as u64) as i32
    }
}

/// `mask` plus everything it encloses: the cells from which no path of unmasked cells (4-connected)
/// reaches the grid's border. A mask of the wrong length is returned unchanged.
pub fn close_loops(w: usize, h: usize, mask: &[bool]) -> Vec<bool> {
    if w == 0 || h == 0 || mask.len() != w.saturating_mul(h) {
        return mask.to_vec();
    }
    let mut outside = vec![false; mask.len()];
    let mut stack: Vec<usize> = Vec::new();
    let visit = |i: usize, outside: &mut Vec<bool>, stack: &mut Vec<usize>| {
        if !mask[i] && !outside[i] {
            outside[i] = true;
            stack.push(i);
        }
    };
    for x in 0..w {
        visit(x, &mut outside, &mut stack);
        visit((h - 1) * w + x, &mut outside, &mut stack);
    }
    for y in 0..h {
        visit(y * w, &mut outside, &mut stack);
        visit(y * w + w - 1, &mut outside, &mut stack);
    }
    while let Some(i) = stack.pop() {
        let (x, y) = (i % w, i / w);
        if x > 0 {
            visit(i - 1, &mut outside, &mut stack);
        }
        if x + 1 < w {
            visit(i + 1, &mut outside, &mut stack);
        }
        if y > 0 {
            visit(i - w, &mut outside, &mut stack);
        }
        if y + 1 < h {
            visit(i + w, &mut outside, &mut stack);
        }
    }
    outside.iter().map(|o| !*o).collect()
}

/// `mask` grown by `r` cells (a square structuring element, clipped to the grid).
pub fn dilate(w: usize, h: usize, mask: &[bool], r: usize) -> Vec<bool> {
    square_dilate::dilate_square(w, h, mask, r)
}

/// The largest chessboard distance from a hole cell to the nearest cell outside the hole (cells
/// beyond the grid don't count as outside: a hole at the canvas edge is not thinner for it).
/// `u32::MAX` when no cell lies outside the hole, 0 for a mask of the wrong size.
pub fn hole_radius(w: usize, h: usize, hole: &[bool]) -> u32 {
    if hole.len() != w.saturating_mul(h) {
        return 0;
    }
    let mut d: Vec<u32> = hole.iter().map(|m| if *m { u32::MAX } else { 0 }).collect();
    let relax = |d: &mut Vec<u32>, i: usize, j: usize| {
        let v = d[j].saturating_add(1);
        if v < d[i] {
            d[i] = v;
        }
    };
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if x > 0 {
                relax(&mut d, i, i - 1);
            }
            if y > 0 {
                relax(&mut d, i, i - w);
                if x > 0 {
                    relax(&mut d, i, i - w - 1);
                }
                if x + 1 < w {
                    relax(&mut d, i, i - w + 1);
                }
            }
        }
    }
    for y in (0..h).rev() {
        for x in (0..w).rev() {
            let i = y * w + x;
            if x + 1 < w {
                relax(&mut d, i, i + 1);
            }
            if y + 1 < h {
                relax(&mut d, i, i + w);
                if x + 1 < w {
                    relax(&mut d, i, i + w + 1);
                }
                if x > 0 {
                    relax(&mut d, i, i + w - 1);
                }
            }
        }
    }
    d.iter().zip(hole).filter(|(_, m)| **m).map(|(v, _)| *v).max().unwrap_or(0)
}

/// Holes covering less than this share of their bounding box (a long stroke, scattered marks) are
/// completed tile by tile, so the work follows the hole rather than its bounding box.
const SPARSE: f64 = 0.25;
/// Smallest tile side, in pixels.
const MIN_TILE: usize = 256;

/// Fill `hole` in `img` from the pixels around it. Returns the full buffer (unchanged outside the
/// hole); a buffer or mask of the wrong size comes back unchanged. When nothing around the hole is
/// fully known (a hole about as big as `img`), it is diffused from its edges instead.
///
/// A sparse hole is filled in tiles eight times its thickness (at least [`MIN_TILE`] pixels), row
/// by row, each with a margin of six times its thickness (at least 48 pixels): each tile sees the
/// ones before it as filled, so the fill runs on across tile edges.
pub fn remove(w: usize, h: usize, ch: usize, img: &[f32], hole: &[bool], seed: u64) -> Vec<f32> {
    let n = w.saturating_mul(h);
    if ch == 0 || hole.len() != n || img.len() != n.saturating_mul(ch) {
        return img.to_vec();
    }
    let (mut bx0, mut by0, mut bx1, mut by1, mut count) = (w, h, 0, 0, 0usize);
    for (i, _) in hole.iter().enumerate().filter(|(_, m)| **m) {
        let (x, y) = (i % w, i / w);
        (bx0, by0, bx1, by1, count) = (bx0.min(x), by0.min(y), bx1.max(x + 1), by1.max(y + 1), count + 1);
    }
    if count == 0 {
        return img.to_vec();
    }
    let thickness = hole_radius(w, h, hole).min(1 << 20) as usize;
    let tile = (8 * thickness).max(MIN_TILE);
    let area = (bx1 - bx0) * (by1 - by0);
    if count as f64 >= SPARSE * area as f64 || (bx1 - bx0).max(by1 - by0) <= 2 * tile {
        return fill(w, h, ch, img, hole, seed);
    }
    let margin = (6 * thickness).max(48);
    let mut out = img.to_vec();
    let mut left = hole.to_vec();
    let origins: Vec<(usize, usize)> = (by0..by1).step_by(tile).flat_map(|y| (bx0..bx1).step_by(tile).map(move |x| (x, y))).collect();
    for (k, &(tx0, ty0)) in origins.iter().enumerate() {
        let (tx1, ty1) = ((tx0 + tile).min(bx1), (ty0 + tile).min(by1));
        if !(ty0..ty1).any(|y| left[y * w + tx0..y * w + tx1].iter().any(|m| *m)) {
            continue;
        }
        let (x0, y0, x1, y1) = (tx0.saturating_sub(margin), ty0.saturating_sub(margin), (tx1 + margin).min(w), (ty1 + margin).min(h));
        let ww = x1 - x0;
        let sub_img: Vec<f32> = (y0..y1).flat_map(|y| out[(y * w + x0) * ch..(y * w + x1) * ch].iter().copied()).collect();
        let sub_hole: Vec<bool> = (y0..y1).flat_map(|y| left[y * w + x0..y * w + x1].iter().copied()).collect();
        let filled = fill(ww, y1 - y0, ch, &sub_img, &sub_hole, seed.wrapping_add(k as u64));
        for y in ty0..ty1 {
            for x in tx0..tx1 {
                let i = y * w + x;
                if left[i] {
                    let j = (y - y0) * ww + (x - x0);
                    out[i * ch..(i + 1) * ch].copy_from_slice(&filled[j * ch..(j + 1) * ch]);
                    left[i] = false;
                }
            }
        }
    }
    out
}

/// Complete one hole, or diffuse it when there is no fully-known patch to copy from.
fn fill(w: usize, h: usize, ch: usize, img: &[f32], hole: &[bool], seed: u64) -> Vec<f32> {
    match complete(w, h, ch, img, hole, &Params { seed, ..Params::default() }) {
        Some(out) => out,
        None => membrane_fill(w, h, ch, img, hole),
    }
}

/// Largest stroke, in pixels of its bounding box.
pub const MAX_STROKE_PIXELS: usize = 16 << 20;
/// Cap on the sampling margin around the stroke (the window grows with the stroke).
const MAX_MARGIN: i32 = 512;
/// How far the hole grows beyond the stroke, in pixels.
const GROW: usize = 2;
/// Seed of the completion, so a removal is reproducible.
const SEED: u64 = 0x0052_e30e;

/// The sampling margin around the stroke: three quarters of its larger side, at least 32 pixels.
fn sampling_margin(area: Rect) -> i32 {
    let ext = u64::from(area.width().max(area.height()));
    i32::try_from(ext * 3 / 4).unwrap_or(i32::MAX).max(32)
}

/// Why [`remove_rgba8`] changed nothing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
    /// The sizes don't match the buffers, or the image is too large.
    BadInput,
    /// The stroke covers no pixel.
    NoStroke,
    /// The stroke is larger than [`MAX_STROKE_PIXELS`].
    TooLarge,
    /// The stroke covers everything: nothing is left to fill it from.
    NothingAround,
    /// The image is fully transparent around the stroke: nothing to remove or fill from.
    Transparent,
}

/// Removes what `stroke` (`width` × `height` flags, non-zero where the brush painted) covers in
/// the straight 8-bit RGBA image `rgba`. With `closed_loops`, what a stroke encloses goes too.
/// Returns the rectangle that changed and its new RGBA bytes (pixels outside the hole keep their
/// exact values).
pub fn remove_rgba8(rgba: &[u8], width: usize, height: usize, stroke: &[u8], closed_loops: bool) -> Result<(Rect, Vec<u8>), Refusal> {
    let n = width.checked_mul(height).filter(|&n| n > 0 && n <= crate::MAX_PIXELS).ok_or(Refusal::BadInput)?;
    if rgba.len() != n * 4 || stroke.len() != n {
        return Err(Refusal::BadInput);
    }
    let canvas = Rect::new(0, 0, i32::try_from(width).map_err(|_| Refusal::BadInput)?, i32::try_from(height).map_err(|_| Refusal::BadInput)?);
    let (mut x0, mut y0, mut x1, mut y1) = (width, height, 0usize, 0usize);
    for (i, _) in stroke.iter().enumerate().filter(|(_, s)| **s != 0) {
        let (x, y) = (i % width, i / width);
        (x0, y0, x1, y1) = (x0.min(x), y0.min(y), x1.max(x + 1), y1.max(y + 1));
    }
    if x1 == 0 {
        return Err(Refusal::NoStroke);
    }
    if (x1 - x0) * (y1 - y0) > MAX_STROKE_PIXELS {
        return Err(Refusal::TooLarge);
    }
    let area = Rect::new(x0 as i32, y0 as i32, x1 as i32, y1 as i32);
    let win = area.inflate(sampling_margin(area).min(MAX_MARGIN)).intersect(&canvas);
    let (ww, wh, wx, wy) = (win.width() as usize, win.height() as usize, win.x0 as usize, win.y0 as usize);
    let index = |i: usize| (wy + i / ww) * width + wx + i % ww;
    let mut hole: Vec<bool> = (0..ww * wh).map(|i| stroke[index(i)] != 0).collect();
    if closed_loops {
        hole = close_loops(ww, wh, &hole);
    }
    hole = dilate(ww, wh, &hole, GROW);
    if hole.iter().all(|m| *m) {
        return Err(Refusal::NothingAround);
    }
    if (0..ww * wh).all(|i| rgba[index(i) * 4 + 3] == 0) {
        return Err(Refusal::Transparent);
    }
    let img: Vec<f32> = (0..ww * wh).flat_map(|i| rgba[index(i) * 4..index(i) * 4 + 4].iter().map(|v| f32::from(*v) / 255.0)).collect();
    let filled = remove(ww, wh, 4, &img, &hole, SEED);
    let mut out = Vec::with_capacity(ww * wh * 4);
    for (i, m) in hole.iter().enumerate() {
        let src = &rgba[index(i) * 4..index(i) * 4 + 4];
        if *m {
            // The seam blending can step slightly past the storable range.
            out.extend(filled[i * 4..i * 4 + 4].iter().map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8));
        } else {
            out.extend_from_slice(src);
        }
    }
    Ok((win, out))
}

#[cfg(test)]
mod tests;
