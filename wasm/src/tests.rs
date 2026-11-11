use super::*;

/// A `w` × `h` RGBA image: an opaque red square from (`x0`, `y0`) of side `side` on a
/// light grey background, with a little deterministic noise.
fn square_image(w: usize, h: usize, x0: usize, y0: usize, side: usize) -> Vec<u8> {
    let mut data = vec![0u8; w * h * 4];
    for y in 0..h {
        for x in 0..w {
            let noise = ((x * 13 + y * 7) % 9) as u8;
            let inside = x >= x0 && x < x0 + side && y >= y0 && y < y0 + side;
            let px = if inside { [200 + noise, 30, 20, 255] } else { [220, 222 - noise, 225, 255] };
            data[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&px);
        }
    }
    data
}

fn selected(r: &Region, x: i32, y: i32) -> bool {
    r.at(x, y) >= 0.5
}

#[test]
fn rect_selection_finds_the_square_inside_a_loose_box() {
    let data = square_image(300, 200, 100, 50, 80);
    let r = object_in_rect(&data, 300, 200, Rect::new(70, 30, 210, 160)).unwrap();
    assert!(selected(&r, 140, 90) && selected(&r, 101, 51) && selected(&r, 178, 128));
    assert!(!selected(&r, 90, 90) && !selected(&r, 190, 90) && !selected(&r, 140, 40));
    assert!(r.bbox.x0 >= 98 && r.bbox.x1 <= 182 && r.bbox.y0 >= 48 && r.bbox.y1 <= 132, "{:?}", r.bbox);
}

#[test]
fn point_selection_finds_the_square_under_the_point() {
    let data = square_image(300, 200, 100, 50, 80);
    let r = object_at_point(&data, 300, 200, 140.0, 90.0).unwrap();
    assert!(selected(&r, 140, 90) && selected(&r, 102, 52));
    assert!(!selected(&r, 90, 90) && !selected(&r, 140, 140));
}

#[test]
fn transparent_pixels_stop_a_point_selection() {
    // A red square on a fully transparent layer: the object is the square, not the transparency.
    let mut data = square_image(200, 160, 60, 40, 60);
    for p in data.chunks_exact_mut(4) {
        if p[1] > 100 {
            p[3] = 0;
        }
    }
    let r = object_at_point(&data, 200, 160, 90.0, 70.0).unwrap();
    assert!(selected(&r, 90, 70) && !selected(&r, 30, 70));
    assert!(object_at_point(&data, 200, 160, 10.0, 10.0).is_none(), "a click on transparency selects nothing");
}

#[test]
fn bad_sizes_and_points_select_nothing() {
    let data = square_image(40, 30, 10, 10, 10);
    assert!(object_in_rect(&data, 0, 30, Rect::new(0, 0, 10, 10)).is_none());
    assert!(object_in_rect(&data, 400, 300, Rect::new(0, 0, 10, 10)).is_none(), "buffer too small");
    assert!(object_in_rect(&data, 40, 30, Rect::new(5, 5, 6, 6)).is_none(), "a 1 px box");
    assert!(object_in_rect(&data, 40, 30, Rect::new(100, 100, 200, 200)).is_none(), "a box off the image");
    assert!(object_at_point(&data, 40, 30, f32::NAN, 3.0).is_none());
    assert!(object_at_point(&data, 40, 30, -1.0, 3.0).is_none());
    assert!(object_at_point(&data, 40, 30, 15.0, 1e9).is_none());
}

#[test]
fn the_exported_interface_round_trips_an_image() {
    let (w, h) = (300usize, 200usize);
    let data = square_image(w, h, 100, 50, 80);
    assert!(image_buffer(0, 10).is_null());
    assert!(image_buffer(u32::MAX, u32::MAX).is_null());
    assert!(!image_buffer(w as u32, h as u32).is_null());
    STATE.with_borrow_mut(|s| s.image.copy_from_slice(&data));
    assert_eq!(select_rect(70, 30, 140, 130), 1);
    let (x, y, rw, rh) = (result_x(), result_y(), result_width(), result_height());
    assert!(rw > 0 && rh > 0);
    let len = STATE.with_borrow(|s| s.result.mask.len());
    assert_eq!(len, (rw * rh) as usize);
    assert!(!result_mask().is_null());
    assert!(x <= 101 && y <= 51 && x + rw as i32 >= 179 && y + rh as i32 >= 129);
    assert_eq!(select_point(140.0, 90.0), 1);
    assert_eq!(select_point(5.0, 5.0), 0, "the background is no object");
    assert_eq!((result_width(), result_height()), (0, 0));
    assert_eq!(select_rect(0, 0, -5, 10), 0);
}
