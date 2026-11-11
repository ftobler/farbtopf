//! Ported from PhotoCraft's Remove Tool tests (MIT; see `LICENSE-photocraft`), plus the 8-bit entry point.

use super::*;

fn grid(w: usize, h: usize, f: impl Fn(usize, usize) -> bool) -> Vec<bool> {
    (0..w * h).map(|i| f(i % w, i / w)).collect()
}

#[test]
fn a_ring_closes_into_a_disc_and_an_open_line_does_not() {
    let (w, h) = (40, 40);
    let ring = grid(w, h, |x, y| {
        let d = (x as f32 - 20.0).hypot(y as f32 - 20.0);
        (10.0..12.0).contains(&d)
    });
    let closed = close_loops(w, h, &ring);
    assert!(closed[20 * w + 20], "the centre is enclosed");
    assert!(!closed[2 * w + 2], "the outside stays outside");
    let line = grid(w, h, |x, y| y == 20 && (5..35).contains(&x));
    assert_eq!(close_loops(w, h, &line), line, "an open stroke encloses nothing");
}

#[test]
fn a_loop_open_at_one_pixel_encloses_nothing() {
    let (w, h) = (20, 20);
    let mut sq = grid(w, h, |x, y| (x == 5 || x == 14 || y == 5 || y == 14) && (5..=14).contains(&x) && (5..=14).contains(&y));
    sq[5 * w + 9] = false;
    assert!(!close_loops(w, h, &sq)[10 * w + 10]);
}

#[test]
fn dilate_grows_by_the_radius() {
    let (w, h) = (11, 11);
    let dot = grid(w, h, |x, y| (x, y) == (5, 5));
    let d = dilate(w, h, &dot, 2);
    assert_eq!(d.iter().filter(|m| **m).count(), 25);
    assert!(d[3 * w + 3] && d[7 * w + 7] && !d[2 * w + 5]);
    assert_eq!(dilate(w, h, &dot, 0), dot);
}

#[test]
fn radius_measures_the_thickest_part() {
    let (w, h) = (30, 30);
    let line = grid(w, h, |x, y| y == 10 && (5..25).contains(&x));
    assert_eq!(hole_radius(w, h, &line), 1);
    let block = grid(w, h, |x, y| (5..16).contains(&x) && (5..16).contains(&y));
    assert_eq!(hole_radius(w, h, &block), 6);
    assert_eq!(hole_radius(w, h, &vec![true; w * h]), u32::MAX);
    assert_eq!(hole_radius(w, h, &[true]), 0, "a mask of the wrong size");
}

/// A hole in a horizontal gradient is filled close to the gradient, both thin and wide.
#[test]
fn removes_thin_and_wide_holes_from_a_gradient() {
    let (w, h, ch) = (64, 48, 2);
    let truth: Vec<f32> = (0..w * h).flat_map(|i| [(i % w) as f32 / w as f32, 1.0]).collect();
    for hole in [grid(w, h, |x, y| y == 24 && (10..54).contains(&x)), grid(w, h, |x, y| (24..40).contains(&x) && (16..32).contains(&y))] {
        let mut img = truth.clone();
        for (i, m) in hole.iter().enumerate() {
            if *m {
                img[i * ch] = 1.0;
            }
        }
        let out = remove(w, h, ch, &img, &hole, 7);
        for (i, m) in hole.iter().enumerate() {
            if *m {
                assert!((out[i * ch] - truth[i * ch]).abs() < 0.12, "pixel {i}: {} vs {}", out[i * ch], truth[i * ch]);
            } else {
                assert_eq!(out[i * ch..(i + 1) * ch], img[i * ch..(i + 1) * ch], "outside the hole is untouched");
            }
        }
    }
}

/// A long, thin diagonal hole goes tile by tile; every cell is filled, the rest is untouched.
#[test]
fn a_long_thin_hole_is_filled_in_tiles() {
    let (w, h, ch) = (900, 700, 1);
    let img: Vec<f32> = (0..w * h).map(|i| 0.3 + 0.4 * (((i % w) / 7 + (i / w) / 5) % 2) as f32).collect();
    let hole = grid(w, h, |x, y| (x as f32 - y as f32 * 1.2 - 20.0).abs() < 3.0 && (40..680).contains(&y));
    let mut holed = img.clone();
    hole.iter().enumerate().filter(|(_, m)| **m).for_each(|(i, _)| holed[i] = 1.0);
    let out = remove(w, h, ch, &holed, &hole, 3);
    for (i, m) in hole.iter().enumerate() {
        if *m {
            assert!((0.29..=0.71).contains(&out[i]), "cell {i} not filled from the stripes: {}", out[i]);
        } else {
            assert_eq!(out[i], holed[i]);
        }
    }
}

#[test]
fn hostile_sizes_return_the_input() {
    let img = vec![0.5f32; 12];
    assert_eq!(remove(2, 2, 3, &img, &[true], 1), img);
    assert_eq!(remove(2, 2, 0, &img, &[true; 4], 1), img);
    assert_eq!(remove(3, 2, 2, &img, &[false; 6], 1), img);
    assert!(close_loops(0, 0, &[]).is_empty());
    assert_eq!(dilate(3, 3, &[true], 1), vec![true]);
}

/// A `w` × `h` RGBA image of vertical stripes (4 px dark, 4 px light) with a red square at
/// (`sx`, `sy`) of side `side`.
fn striped_with_square(w: usize, h: usize, sx: usize, sy: usize, side: usize) -> Vec<u8> {
    let mut data = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        for x in 0..w {
            let square = x >= sx && x < sx + side && y >= sy && y < sy + side;
            data.extend_from_slice(&if square { [220, 20, 30, 255] } else if (x / 4) % 2 == 0 { [40, 60, 80, 255] } else { [200, 210, 220, 255] });
        }
    }
    data
}

fn stroke_rect(w: usize, h: usize, x0: usize, y0: usize, x1: usize, y1: usize) -> Vec<u8> {
    (0..w * h).map(|i| u8::from((x0..x1).contains(&(i % w)) && (y0..y1).contains(&(i / w)))).collect()
}

#[test]
fn removing_a_square_painted_over_leaves_the_stripes() {
    let (w, h) = (160, 120);
    let img = striped_with_square(w, h, 70, 50, 12);
    let stroke = stroke_rect(w, h, 68, 48, 84, 64);
    let (win, out) = remove_rgba8(&img, w, h, &stroke, true).unwrap();
    assert!(win.x0 <= 66 && win.y0 <= 46 && win.x1 >= 86 && win.y1 >= 66, "{win:?}");
    let ww = win.width() as usize;
    let at = |x: usize, y: usize| &out[((y - win.y0 as usize) * ww + x - win.x0 as usize) * 4..][..4];
    for y in 50..62 {
        for x in 70..82 {
            let p = at(x, y);
            assert!(!(p[0] > 150 && p[1] < 80), "red is left at ({x}, {y}): {p:?}");
            assert_eq!(p[3], 255);
        }
    }
    // Outside the hole the window holds the image's exact bytes.
    for (x, y) in [(win.x0 as usize, win.y0 as usize), (60, 56), (100, 100)] {
        if win.contains(x as i32, y as i32) {
            assert_eq!(at(x, y), &img[(y * w + x) * 4..][..4]);
        }
    }
}

#[test]
fn a_loop_around_an_object_removes_what_it_encloses() {
    let (w, h) = (160, 120);
    let img = striped_with_square(w, h, 70, 50, 12);
    // A 3 px ring around the square, leaving the square itself unpainted.
    let ring: Vec<u8> = (0..w * h)
        .map(|i| {
            let (x, y) = (i % w, i / w);
            let outer = (64..90).contains(&x) && (44..70).contains(&y);
            let inner = (67..87).contains(&x) && (47..67).contains(&y);
            u8::from(outer && !inner)
        })
        .collect();
    let (win, out) = remove_rgba8(&img, w, h, &ring, true).unwrap();
    let ww = win.width() as usize;
    let centre = &out[((56 - win.y0 as usize) * ww + 76 - win.x0 as usize) * 4..][..4];
    assert!(!(centre[0] > 150 && centre[1] < 80), "the enclosed square is removed: {centre:?}");
    let (win, out) = remove_rgba8(&img, w, h, &ring, false).unwrap();
    let ww = win.width() as usize;
    let centre = &out[((56 - win.y0 as usize) * ww + 76 - win.x0 as usize) * 4..][..4];
    assert_eq!(centre, [220, 20, 30, 255], "without closing loops the inside stays");
}

#[test]
fn refusals() {
    let (w, h) = (40, 30);
    let img = striped_with_square(w, h, 10, 10, 5);
    assert_eq!(remove_rgba8(&img, w, h, &vec![0; w * h], true), Err(Refusal::NoStroke));
    assert_eq!(remove_rgba8(&img, w, h, &vec![1; w * h], true), Err(Refusal::NothingAround));
    assert_eq!(remove_rgba8(&img, w, h, &[1; 3], true), Err(Refusal::BadInput));
    assert_eq!(remove_rgba8(&img[..8], w, h, &vec![1; w * h], true), Err(Refusal::BadInput));
    assert_eq!(remove_rgba8(&[], 0, 0, &[], true), Err(Refusal::BadInput));
    let clear = vec![0u8; w * h * 4];
    assert_eq!(remove_rgba8(&clear, w, h, &stroke_rect(w, h, 5, 5, 9, 9), true), Err(Refusal::Transparent));
}
