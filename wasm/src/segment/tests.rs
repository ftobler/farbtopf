//! Ported from PhotoCraft's `photocraft-algo` segmentation tests (MIT; see `LICENSE-photocraft`).

use super::gmm::Gmm;
use super::maxflow::Graph;
use super::*;
use crate::geom::Rect;

// ---------- max-flow ----------

#[test]
fn maxflow_tiny_graph() {
    // s→a 3, s→b 2, a→b 1, a→t 2, b→t 3: max flow 5.
    let mut g = Graph::with_capacity(2, 1);
    g.add_tweights(0, 3.0, 2.0);
    g.add_tweights(1, 2.0, 3.0);
    g.add_edge(0, 1, 1.0, 0.0);
    assert_eq!(g.maxflow(), 5.0);
}

#[test]
fn maxflow_clrs_network() {
    // The classic textbook network (max flow 23): v1..v4 = 0..3.
    let mut g = Graph::with_capacity(4, 5);
    g.add_tweights(0, 16.0, 0.0);
    g.add_tweights(1, 13.0, 0.0);
    g.add_tweights(2, 0.0, 20.0);
    g.add_tweights(3, 0.0, 4.0);
    g.add_edge(0, 1, 10.0, 4.0);
    g.add_edge(0, 2, 12.0, 0.0);
    g.add_edge(2, 1, 9.0, 0.0);
    g.add_edge(1, 3, 14.0, 0.0);
    g.add_edge(3, 2, 7.0, 0.0);
    assert_eq!(g.maxflow(), 23.0);
    // Min cut {s, v1, v2, v4} | {v3, t}.
    assert!(g.in_source(0) && g.in_source(1) && g.in_source(3));
    assert!(!g.in_source(2));
}

/// Reference max flow (Edmonds–Karp on a dense matrix; node 0 = s, n−1 = t).
fn edmonds_karp(cap: &mut [Vec<f64>]) -> f64 {
    let n = cap.len();
    let mut flow = 0.0;
    loop {
        let mut prev = vec![usize::MAX; n];
        prev[0] = 0;
        let mut q = std::collections::VecDeque::from([0usize]);
        while let Some(u) = q.pop_front() {
            for v in 0..n {
                if prev[v] == usize::MAX && cap[u][v] > 1e-9 {
                    prev[v] = u;
                    q.push_back(v);
                }
            }
        }
        if prev[n - 1] == usize::MAX {
            return flow;
        }
        let mut b = f64::MAX;
        let mut v = n - 1;
        while v != 0 {
            b = b.min(cap[prev[v]][v]);
            v = prev[v];
        }
        let mut v = n - 1;
        while v != 0 {
            cap[prev[v]][v] -= b;
            cap[v][prev[v]] += b;
            v = prev[v];
        }
        flow += b;
    }
}

#[test]
fn maxflow_matches_reference_on_random_graphs() {
    let mut rng = Rng::new(7);
    for trial in 0..60 {
        let n = 3 + (trial % 12);
        let mut g = Graph::with_capacity(n, n * 3);
        let mut cap = vec![vec![0.0f64; n + 2]; n + 2];
        let mut edges = Vec::new();
        for i in 0..n {
            let (s, t) = ((rng.f32() * 10.0).round(), (rng.f32() * 10.0).round());
            let (s, t) = (if rng.f32() < 0.4 { 0.0 } else { s }, if rng.f32() < 0.4 { 0.0 } else { t });
            g.add_tweights(i, s, t);
            cap[0][i + 1] += s as f64;
            cap[i + 1][n + 1] += t as f64;
        }
        for i in 0..n {
            for j in i + 1..n {
                if rng.f32() < 0.35 {
                    let (a, b) = ((rng.f32() * 8.0).round(), (rng.f32() * 8.0).round());
                    g.add_edge(i, j, a, b);
                    cap[i + 1][j + 1] += a as f64;
                    cap[j + 1][i + 1] += b as f64;
                    edges.push((i, j, a, b));
                }
            }
        }
        let orig = cap.clone();
        let reference = edmonds_karp(&mut cap);
        let f = g.maxflow();
        assert!((f - reference).abs() < 1e-3, "trial {trial}: {f} vs {reference}");
        // The reported cut has exactly that capacity.
        let side = |i: usize| g.in_source(i);
        let mut cut = 0.0;
        for i in 0..n {
            if side(i) {
                cut += orig[i + 1][n + 1];
            } else {
                cut += orig[0][i + 1];
            }
        }
        for &(i, j, a, b) in &edges {
            if side(i) && !side(j) {
                cut += a as f64;
            }
            if side(j) && !side(i) {
                cut += b as f64;
            }
        }
        assert!((cut - reference).abs() < 1e-3, "trial {trial}: cut {cut} vs flow {reference}");
    }
}

#[test]
fn grid_cut_separates_two_halves() {
    let img = RgbImage::from_fn(20, 10, |x, _| if x < 10 { [0.9, 0.1, 0.1] } else { [0.1, 0.1, 0.9] });
    let n = img.w * img.h;
    let mut fixed = vec![FREE; n];
    fixed[5 * 20 + 1] = HARD_FG;
    fixed[5 * 20 + 18] = HARD_BG;
    let zeros = vec![0.0; n];
    let beta = contrast_beta(&img);
    let cut = grid_cut(&img, &zeros, &zeros, &fixed, 50.0, beta);
    for y in 0..10 {
        for x in 0..20 {
            assert_eq!(cut[y * 20 + x], x < 10, "({x},{y})");
        }
    }
}

// ---------- GMM ----------

#[test]
fn gmm_recovers_synthetic_clusters() {
    let mut rng = Rng::new(3);
    let truth = [([0.2f32, 0.3, 0.8], 0.03f32, 0.5f32), ([0.8, 0.2, 0.1], 0.05, 0.3), ([0.5, 0.9, 0.4], 0.02, 0.2)];
    let mut samples = Vec::new();
    for (mean, sd, w) in truth {
        for _ in 0..(w * 6000.0) as usize {
            samples.push(mean.map(|m| m + sd * rng.normal()));
        }
    }
    let g = Gmm::fit(&samples, 3, gmm::DEFAULT_REG).unwrap();
    assert_eq!(g.comps.len(), 3);
    for (mean, sd, w) in truth {
        let c = g.comps.iter().min_by(|a, b| d2(a.mean, mean).total_cmp(&d2(b.mean, mean))).unwrap();
        assert!(d2(c.mean, mean).sqrt() < 0.01, "{:?} vs {mean:?}", c.mean);
        assert!((c.weight - w).abs() < 0.03, "{} vs {w}", c.weight);
        let var = c.cov[0][0];
        assert!((var.sqrt() - sd).abs() < 0.01, "sd {} vs {sd}", var.sqrt());
    }
    assert!(g.neg_log([0.2, 0.3, 0.8]) < g.neg_log([0.5, 0.5, 0.5]));
    // Refit keeps the model stable.
    let r = g.refit(&samples).unwrap();
    assert_eq!(r.comps.len(), 3);
}

// ---------- GrabCut / object selection ----------

/// A textured disc on a noisy background: (image, ground-truth mask).
pub(crate) fn disc_scene(w: usize, h: usize, cx: f32, cy: f32, r: f32, seed: u64) -> (RgbImage, Vec<bool>) {
    let mut rng = Rng::new(seed);
    let mut img = RgbImage::new(w, h);
    let mut truth = vec![false; w * h];
    for y in 0..h {
        for x in 0..w {
            let (dx, dy) = (x as f32 + 0.5 - cx, y as f32 + 0.5 - cy);
            let inside = dx * dx + dy * dy <= r * r;
            truth[y * w + x] = inside;
            let n = 0.05 * rng.normal();
            img.px[y * w + x] = if inside {
                // Stripes between two warm colours plus noise.
                let t = (((x + y) as f32 * 0.35).sin() * 0.5 + 0.5).clamp(0.0, 1.0);
                [0.85 + 0.05 * t + n, 0.2 + 0.3 * t + n, 0.15 + n]
            } else {
                [0.25 + n, 0.45 + n, 0.7 + n]
            }
            .map(|v| v.clamp(0.0, 1.0));
        }
    }
    (img, truth)
}

pub(crate) fn iou(region: &Region, truth: &[bool], w: usize, h: usize) -> f32 {
    let (mut inter, mut uni) = (0usize, 0usize);
    for y in 0..h {
        for x in 0..w {
            let a = region.at(x as i32, y as i32) >= 0.5;
            let b = truth[y * w + x];
            inter += (a && b) as usize;
            uni += (a || b) as usize;
        }
    }
    inter as f32 / uni.max(1) as f32
}

#[test]
fn grabcut_trimap_on_disc() {
    let (img, truth) = disc_scene(120, 100, 60.0, 50.0, 30.0, 1);
    let mut tri = vec![grabcut::BG; img.w * img.h];
    for y in 12..88 {
        for x in 22..98 {
            tri[y * img.w + x] = grabcut::PR_FG;
        }
    }
    grabcut::grabcut(&img, &mut tri, 8).unwrap();
    let (mut inter, mut uni) = (0, 0);
    for (t, g) in tri.iter().zip(&truth) {
        let a = *t == grabcut::PR_FG || *t == grabcut::FG;
        inter += (a && *g) as usize;
        uni += (a || *g) as usize;
    }
    let iou = inter as f32 / uni as f32;
    assert!(iou > 0.95, "IoU {iou}");
}

#[test]
fn grabcut_small_disc_mask_is_pinned() {
    // The mask GrabCut produced with the push/relabel solver, before the switch to BK. Min-cut
    // ties may break differently between solvers, so any drift here is a visible change.
    let (img, _) = disc_scene(32, 24, 16.0, 12.0, 8.0, 3);
    let mut tri = vec![grabcut::BG; img.w * img.h];
    for y in 2..22 {
        for x in 6..26 {
            tri[y * img.w + x] = grabcut::PR_FG;
        }
    }
    grabcut::grabcut(&img, &mut tri, 8).unwrap();
    let got: Vec<String> = tri.chunks(img.w).map(|r| r.iter().map(|t| if *t == grabcut::PR_FG || *t == grabcut::FG { '#' } else { '.' }).collect()).collect();
    let want = [
        "................................",
        "................................",
        "................................",
        "................................",
        ".............######.............",
        "...........##########...........",
        "..........############..........",
        ".........##############.........",
        ".........##############.........",
        "........################........",
        "........################........",
        "........################........",
        "........################........",
        "........################........",
        "........################........",
        ".........##############.........",
        ".........##############.........",
        "..........############..........",
        "...........##########...........",
        ".............######.............",
        "................................",
        "................................",
        "................................",
        "................................",
    ];
    assert_eq!(got, want);
}

#[test]
fn grabcut_large_disc_mask_is_pinned() {
    // 5168 free nodes with terminal links both ways, so the pre-BK solver was push/relabel here.
    // The count and FNV-1a hash are of the mask that push/relabel produced at the merge base.
    let (img, _) = disc_scene(96, 80, 48.0, 40.0, 26.0, 3);
    let mut tri = vec![grabcut::BG; img.w * img.h];
    for y in 6..74 {
        for x in 10..86 {
            tri[y * img.w + x] = grabcut::PR_FG;
        }
    }
    grabcut::grabcut(&img, &mut tri, 8).unwrap();
    let fg: Vec<bool> = tri.iter().map(|t| *t == grabcut::PR_FG || *t == grabcut::FG).collect();
    let hash = fg.iter().fold(0xcbf2_9ce4_8422_2325u64, |h, b| (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3));
    assert_eq!((fg.iter().filter(|b| **b).count(), hash), (2128, 0x62fd_c64a_0ee4_4e75));
}

#[test]
fn object_select_disc_full_resolution() {
    let (img, truth) = disc_scene(200, 160, 100.0, 80.0, 50.0, 2);
    let s = ImageSampler { img: &img, origin: (0, 0) };
    let canvas = Rect::new(0, 0, 200, 160);
    let reg = grabcut::object_select(&s, canvas, Rect::new(40, 20, 160, 140), 1_000_000).unwrap();
    let v = iou(&reg, &truth, 200, 160);
    assert!(v > 0.95, "IoU {v}");
}

#[test]
fn object_select_downsampled_with_band_refinement() {
    let (img, truth) = disc_scene(640, 480, 330.0, 250.0, 150.0, 3);
    let s = ImageSampler { img: &img, origin: (0, 0) };
    let canvas = Rect::new(0, 0, 640, 480);
    // A small working budget forces step > 1 and the full-resolution band re-cut.
    let reg = grabcut::object_select(&s, canvas, Rect::new(160, 80, 500, 420), 20_000).unwrap();
    let v = iou(&reg, &truth, 640, 480);
    assert!(v > 0.95, "IoU {v}");
    // Boundary accuracy: few pixels wrong far (> 2 px) from the true edge.
    let mut far_wrong = 0;
    for y in 0..480 {
        for x in 0..640 {
            let (dx, dy) = (x as f32 + 0.5 - 330.0, y as f32 + 0.5 - 250.0);
            let d = (dx * dx + dy * dy).sqrt() - 150.0;
            if d.abs() > 2.0 && (reg.at(x, y) >= 0.5) != truth[y as usize * 640 + x as usize] {
                far_wrong += 1;
            }
        }
    }
    assert!(far_wrong < 300, "{far_wrong} pixels wrong away from the edge");
}

// ---------- helpers ----------

#[test]
fn sampler_downsampling_matches_image_downsample() {
    let img = RgbImage::from_fn(37, 29, |x, y| [x as f32 / 37.0, y as f32 / 29.0, ((x * y) % 7) as f32 / 7.0]);
    let s = ImageSampler { img: &img, origin: (5, 3) };
    let a = s.rgb_scaled(Rect::new(5, 3, 42, 32), 4);
    let b = img.downsample(4);
    assert_eq!((a.w, a.h), (b.w, b.h));
    for (p, q) in a.px.iter().zip(&b.px) {
        for c in 0..3 {
            assert!((p[c] - q[c]).abs() < 1e-5);
        }
    }
}

#[test]
fn clean_mask_drops_islands_and_fills_holes() {
    let (w, h) = (40, 40);
    let mut m = vec![false; w * h];
    for y in 5..30 {
        for x in 5..30 {
            m[y * w + x] = true;
        }
    }
    m[15 * w + 15] = false; // hole
    m[36 * w + 36] = true; // island
    let c = clean_mask(&m, w, h, 0.1, 0.05);
    assert!(c[15 * w + 15]);
    assert!(!c[36 * w + 36]);
}

#[test]
fn object_at_finds_the_disc_under_the_cursor() {
    let (img, truth) = disc_scene(320, 240, 160.0, 120.0, 70.0, 7);
    let s = ImageSampler { img: &img, origin: (0, 0) };
    let canvas = Rect::new(0, 0, 320, 240);
    let reg = grabcut::object_at(&s, canvas, 165.0, 118.0, 20_000).unwrap();
    let v = iou(&reg, &truth, 320, 240);
    assert!(v > 0.9, "IoU {v}");
}

#[test]
fn object_at_keeps_large_foregrounds_but_not_the_surrounding_background() {
    let (w, h) = (400, 300);
    for margin in [30, 20, 8] {
        let inside = |x: usize, y: usize| x >= margin && x < w - margin && y >= margin && y < h - margin;
        let img = RgbImage::from_fn(w, h, |x, y| {
            let noise = ((x * 13 + y * 7) % 17) as f32 / 850.0;
            if inside(x, y) { [0.8 + noise, 0.2, 0.1] } else { [0.1, 0.2, 0.8 + noise] }
        });
        let truth: Vec<_> = (0..w * h).map(|i| inside(i % w, i / w)).collect();
        let sampler = ImageSampler { img: &img, origin: (-40, 25) };
        let canvas = Rect::new(-40, 25, w as i32 - 40, h as i32 + 25);
        let region = grabcut::object_at(&sampler, canvas, 160.0, 175.0, grabcut::OBJECT_AT_WORK_PX)
            .unwrap_or_else(|| panic!("missing large foreground with margin {margin}"));
        let local = Region { bbox: region.bbox.translate(40, -25), mask: region.mask };
        assert!(iou(&local, &truth, w, h) > 0.95, "margin {margin}");
        assert!(grabcut::object_at(&sampler, canvas, -39.0, 26.0, grabcut::OBJECT_AT_WORK_PX).is_none(), "background margin {margin}");
    }
}

#[test]
fn object_at_allows_a_foreground_touching_one_edge_but_rejects_a_flat_image() {
    let img = RgbImage::from_fn(400, 300, |x, y| if x < 360 && (20..280).contains(&y) { [0.8, 0.2, 0.1] } else { [0.1, 0.2, 0.8] });
    let sampler = ImageSampler { img: &img, origin: (0, 0) };
    let canvas = Rect::new(0, 0, 400, 300);
    let region = grabcut::object_at(&sampler, canvas, 200.0, 150.0, grabcut::OBJECT_AT_WORK_PX).unwrap();
    assert!(region.at(0, 150) > 0.9 && region.at(350, 150) > 0.9);
    assert!(region.at(380, 150) < 0.1 && region.at(200, 5) < 0.1);
    let flat = RgbImage::from_fn(400, 300, |_, _| [0.5; 3]);
    assert!(grabcut::object_at(&ImageSampler { img: &flat, origin: (0, 0) }, canvas, 200.0, 150.0, grabcut::OBJECT_AT_WORK_PX).is_none());
}

#[test]
fn object_at_on_the_background_or_off_canvas_finds_nothing() {
    let (img, _) = disc_scene(320, 240, 160.0, 120.0, 70.0, 7);
    let s = ImageSampler { img: &img, origin: (0, 0) };
    let canvas = Rect::new(0, 0, 320, 240);
    assert!(grabcut::object_at(&s, canvas, 10.0, 10.0, 20_000).is_none());
    assert!(grabcut::object_at(&s, canvas, -5.0, 10.0, 20_000).is_none());
    assert!(grabcut::object_at(&s, canvas, f32::NAN, 10.0, 20_000).is_none());
    assert!(grabcut::object_at(&s, canvas, 400.0, 10.0, 0).is_none());
}

/// #6576: a 24 px object in a 4000×3000 document is found (a 1000×800 one still is).
#[test]
fn object_at_finds_small_object_in_large_canvas() {
    let (w, h) = (4000usize, 3000usize);
    let canvas = Rect::new(0, 0, w as i32, h as i32);
    for (ox, oy, ow, oh) in [(188usize, 138usize, 24usize, 24usize), (1500, 1100, 1000, 800)] {
        let inside = |x: usize, y: usize| x >= ox && x < ox + ow && y >= oy && y < oy + oh;
        let img = RgbImage::from_fn(w, h, |x, y| if inside(x, y) { [0.8, 0.1, 0.1] } else { [0.9, 0.9, 0.9] });
        let truth: Vec<bool> = (0..w * h).map(|i| inside(i % w, i / w)).collect();
        let s = ImageSampler { img: &img, origin: (0, 0) };
        let (cx, cy) = ((ox + ow / 2) as f32, (oy + oh / 2) as f32);
        let reg = grabcut::object_at(&s, canvas, cx, cy, grabcut::OBJECT_AT_WORK_PX);
        let reg = reg.unwrap_or_else(|| panic!("the {ow}×{oh} object is not found"));
        let v = iou(&reg, &truth, w, h);
        assert!(v > 0.8, "{ow}×{oh}: IoU {v}");
    }
    // The flat background around the small object is still nothing.
    let img = RgbImage::from_fn(w, h, |x, y| if (188..212).contains(&x) && (138..162).contains(&y) { [0.8, 0.1, 0.1] } else { [0.9, 0.9, 0.9] });
    let s = ImageSampler { img: &img, origin: (0, 0) };
    assert!(grabcut::object_at(&s, canvas, 400.0, 300.0, grabcut::OBJECT_AT_WORK_PX).is_none());
}

#[test]
fn antialias_blends_edge_pixels_with_their_neighbourhood() {
    // A lone selected pixel keeps most of its coverage and its neighbours get half of a ninth;
    // neighbours outside the mask count as the pixel itself.
    let mut m = vec![0, 0, 0, 0, 255, 0, 0, 0, 0];
    antialias_u8(&mut m, 3, 3);
    assert_eq!(m, [14, 14, 14, 14, 142, 14, 14, 14, 14]);
}

#[test]
fn antialias_skips_only_spans_without_edge_pixels() {
    // Every pixel through the per-pixel rule, no span skipped.
    let every_pixel = |mask: &mut [u8], w: usize, h: usize| {
        let src = mask.to_vec();
        for y in 0..h {
            for x in 0..w {
                if let Some(v) = edge_value(&src, w, h, x, y) {
                    mask[y * w + x] = v;
                }
            }
        }
    };
    let mut rng = Rng::new(11);
    // Widths around the 64-pixel span, single rows and columns, discs, noise and stripes.
    for (w, h) in [(1usize, 1usize), (1, 9), (9, 1), (63, 4), (64, 3), (65, 5), (127, 2), (129, 70), (300, 200)] {
        let (cx, cy, r) = (w as f32 * 0.6, h as f32 * 0.4, w.min(h) as f32 / 3.0);
        let masks: Vec<Vec<u8>> = vec![
            vec![255; w * h],
            vec![0; w * h],
            (0..w * h).map(|i| if ((i % w) as f32 - cx).hypot((i / w) as f32 - cy) < r { 255 } else { 0 }).collect(),
            (0..w * h).map(|_| if rng.f32() < 0.02 { 255 } else { 0 }).collect(),
            (0..w * h).map(|_| if rng.f32() < 0.5 { 255 } else { 0 }).collect(),
            (0..w * h).map(|i| if (i % w) / 64 % 2 == 0 { 255 } else { 0 }).collect(),
            (0..w * h).map(|i| if i % w == w - 1 || i / w == h / 2 { 255 } else { 0 }).collect(),
        ];
        for (k, m) in masks.into_iter().enumerate() {
            let (mut fast, mut slow) = (m.clone(), m);
            antialias_u8(&mut fast, w, h);
            every_pixel(&mut slow, w, h);
            assert!(fast == slow, "{w}×{h} mask {k}");
        }
    }
}

/// A dark square on a light background with a square hole that shows the background colour.
fn square_with_hole(hole: usize) -> RgbImage {
    let (w, h) = (400usize, 300usize);
    let mut rng = Rng::new(11);
    let (x0, y0) = (100usize, 50usize);
    RgbImage::from_fn(w, h, |x, y| {
        let n = 0.02 * rng.normal();
        let in_square = x >= x0 && x < x0 + 200 && y >= y0 && y < y0 + 200;
        let in_hole = x >= x0 + 96 && x < x0 + 96 + hole && y >= y0 + 96 && y < y0 + 96 + hole;
        let c = if in_square && !in_hole { [0.1, 0.12, 0.15] } else { [0.9, 0.9, 0.85] };
        c.map(|v: f32| (v + n).clamp(0.0, 1.0))
    })
}

#[test]
fn object_select_keeps_small_background_hole_open() {
    let img = square_with_hole(8);
    let s = ImageSampler { img: &img, origin: (0, 0) };
    let canvas = Rect::new(0, 0, 400, 300);
    let reg = grabcut::object_select(&s, canvas, Rect::new(80, 30, 320, 270), 1_000_000).unwrap();
    assert!(reg.at(150, 100) >= 0.5, "the square itself is selected");
    assert!(reg.at(200, 150) < 0.5, "background seen through the object stays unselected");
}

#[test]
fn object_at_keeps_small_background_hole_open() {
    let img = square_with_hole(16);
    let s = ImageSampler { img: &img, origin: (0, 0) };
    let canvas = Rect::new(0, 0, 400, 300);
    let reg = grabcut::object_at(&s, canvas, 130.0, 80.0, 1_000_000).unwrap();
    assert!(reg.at(150, 100) >= 0.5, "the square itself is selected");
    assert!(reg.at(203, 153) < 0.5, "background seen through the object stays unselected");
}

#[test]
fn hole_fill_without_specks_fills_object_coloured_holes_only() {
    // The hole check Object Selection uses: no hole fills just for being small, a speck of the object's colour still does.
    let (w, h) = (40usize, 40usize);
    let mut rng = Rng::new(5);
    let in_square = |x: usize, y: usize| (5..35).contains(&x) && (5..35).contains(&y);
    let bg_hole = |x: usize, y: usize| (10..12).contains(&x) && (10..12).contains(&y);
    let fg_hole = |x: usize, y: usize| (25..27).contains(&x) && (25..27).contains(&y);
    let img = RgbImage::from_fn(w, h, |x, y| {
        let n = 0.02 * rng.normal();
        let c = if in_square(x, y) && !bg_hole(x, y) { [0.1, 0.12, 0.15] } else { [0.9, 0.9, 0.85] };
        c.map(|v: f32| (v + n).clamp(0.0, 1.0))
    });
    let mask: Vec<bool> = (0..w * h).map(|i| in_square(i % w, i / w) && !bg_hole(i % w, i / w) && !fg_hole(i % w, i / w)).collect();
    // The colour models, as GrabCut would fit them: the object colour vs. the backdrop colour.
    let dark: Vec<bool> = (0..w * h).map(|i| in_square(i % w, i / w) && !bg_hole(i % w, i / w)).collect();
    let (fs, bs): (Vec<_>, Vec<_>) = img.px.iter().zip(&dark).partition(|(_, m)| **m);
    let fit = |v: Vec<(&[f32; 3], &bool)>| Gmm::fit(&v.iter().map(|(p, _)| **p).collect::<Vec<_>>(), 3, gmm::DEFAULT_REG).unwrap();
    let (fg, bg) = (fit(fs), fit(bs));
    let out = fill_holes_by_model(&mask, &img, &fg, &bg, 0.0, 0.05);
    assert!(out[25 * w + 25], "a speck of the object's colour fills");
    assert!(!out[10 * w + 10], "a speck of the background's colour stays open");
}
