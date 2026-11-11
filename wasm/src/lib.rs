//! Image algorithms for Farbtopf, compiled to WebAssembly.
//!
//! The segmentation code is adapted from PhotoCraft (<https://github.com/storytold/photocraft>),
//! Copyright (c) 2026 ArtCraft Team and the PhotoCraft contributors, MIT licensed; see
//! `LICENSE-photocraft`.
//!
//! # The WebAssembly interface
//!
//! The module holds one image and one result. JavaScript calls [`image_buffer`] with the
//! image's size, copies straight 8-bit RGBA (`ImageData.data`) to the returned address, then
//! calls [`select_rect`] or [`select_point`]. On success (`1`) the selection is
//! [`result_width`] × [`result_height`] coverage bytes at [`result_mask`], placed at
//! ([`result_x`], [`result_y`]) on the image. The image stays loaded, so several selections on
//! the same pixels need one copy. Memory may grow during a call: views into it must be made
//! afresh after each call.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

pub mod geom;
pub mod segment;

use std::cell::RefCell;

use geom::Rect;
use segment::{Region, Rgba8Sampler, grabcut};

/// Largest image accepted, in pixels (the canvas limit of the common browsers).
pub const MAX_PIXELS: usize = 268_435_456;
/// Working-resolution budget of a rectangle selection, in pixels.
pub const RECT_WORK_PX: usize = 160_000;

#[derive(Default)]
struct State {
    image: Vec<u8>,
    width: usize,
    height: usize,
    result: Region,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

/// The object inside `rect` of the `width` × `height` RGBA image `data`.
pub fn object_in_rect(data: &[u8], width: usize, height: usize, rect: Rect) -> Option<Region> {
    let canvas = canvas_rect(data, width, height)?;
    grabcut::object_select(&Rgba8Sampler { data, w: width, h: height }, canvas, rect, RECT_WORK_PX)
}

/// The object under image point (`x`, `y`) of the `width` × `height` RGBA image `data`.
pub fn object_at_point(data: &[u8], width: usize, height: usize, x: f32, y: f32) -> Option<Region> {
    let canvas = canvas_rect(data, width, height)?;
    grabcut::object_at(&Rgba8Sampler { data, w: width, h: height }, canvas, x, y, grabcut::OBJECT_AT_WORK_PX)
}

fn canvas_rect(data: &[u8], width: usize, height: usize) -> Option<Rect> {
    let pixels = width.checked_mul(height).filter(|&n| n > 0 && n <= MAX_PIXELS)?;
    if data.len() < pixels.checked_mul(4)? {
        return None;
    }
    Some(Rect::new(0, 0, i32::try_from(width).ok()?, i32::try_from(height).ok()?))
}

/// Makes room for a `width` × `height` RGBA image and returns where to write it, or null when
/// the size is zero or too large.
#[unsafe(no_mangle)]
pub extern "C" fn image_buffer(width: u32, height: u32) -> *mut u8 {
    let (width, height) = (width as usize, height as usize);
    let Some(bytes) = width.checked_mul(height).filter(|&n| n > 0 && n <= MAX_PIXELS).and_then(|n| n.checked_mul(4)) else {
        return std::ptr::null_mut();
    };
    STATE.with_borrow_mut(|s| {
        s.image.clear();
        s.image.resize(bytes, 0);
        s.width = width;
        s.height = height;
        s.result = Region::default();
        s.image.as_mut_ptr()
    })
}

/// Selects the object inside the rectangle at (`x`, `y`) of size `width` × `height`.
/// Returns 1 when something was selected, else 0.
#[unsafe(no_mangle)]
pub extern "C" fn select_rect(x: i32, y: i32, width: i32, height: i32) -> u32 {
    let rect = Rect::new(x, y, x.saturating_add(width.max(0)), y.saturating_add(height.max(0)));
    STATE.with_borrow_mut(|s| {
        let found = object_in_rect(&s.image, s.width, s.height, rect);
        store(s, found)
    })
}

/// Selects the object under the image point (`x`, `y`). Returns 1 when something was
/// selected, else 0.
#[unsafe(no_mangle)]
pub extern "C" fn select_point(x: f32, y: f32) -> u32 {
    STATE.with_borrow_mut(|s| {
        let found = object_at_point(&s.image, s.width, s.height, x, y);
        store(s, found)
    })
}

fn store(s: &mut State, found: Option<Region>) -> u32 {
    let ok = found.is_some();
    s.result = found.unwrap_or_default();
    u32::from(ok)
}

#[unsafe(no_mangle)]
pub extern "C" fn result_x() -> i32 {
    STATE.with_borrow(|s| s.result.bbox.x0)
}

#[unsafe(no_mangle)]
pub extern "C" fn result_y() -> i32 {
    STATE.with_borrow(|s| s.result.bbox.y0)
}

#[unsafe(no_mangle)]
pub extern "C" fn result_width() -> u32 {
    STATE.with_borrow(|s| s.result.bbox.width())
}

#[unsafe(no_mangle)]
pub extern "C" fn result_height() -> u32 {
    STATE.with_borrow(|s| s.result.bbox.height())
}

/// The result's coverage bytes (0–255, row-major).
#[unsafe(no_mangle)]
pub extern "C" fn result_mask() -> *const u8 {
    STATE.with_borrow(|s| s.result.mask.as_ptr())
}

#[cfg(test)]
mod tests;
