//! Integer rectangles (adapted from PhotoCraft's `photocraft-geom`, MIT; see `LICENSE-photocraft`).

/// Integer rectangle, half-open: `[x0, x1) × [y0, y1)`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Rect {
    pub x0: i32,
    pub y0: i32,
    pub x1: i32,
    pub y1: i32,
}

impl Rect {
    pub const EMPTY: Rect = Rect { x0: 0, y0: 0, x1: 0, y1: 0 };

    pub const fn new(x0: i32, y0: i32, x1: i32, y1: i32) -> Self {
        Self { x0, y0, x1, y1 }
    }
    /// Horizontal extent; 0 when `x1 <= x0`.
    pub fn width(&self) -> u32 {
        if self.x1 > self.x0 { self.x1.abs_diff(self.x0) } else { 0 }
    }
    /// Vertical extent; 0 when `y1 <= y0`.
    pub fn height(&self) -> u32 {
        if self.y1 > self.y0 { self.y1.abs_diff(self.y0) } else { 0 }
    }
    pub fn is_empty(&self) -> bool {
        self.x1 <= self.x0 || self.y1 <= self.y0
    }
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x0 && x < self.x1 && y >= self.y0 && y < self.y1
    }
    pub fn intersect(&self, o: &Rect) -> Rect {
        let r = Rect::new(self.x0.max(o.x0), self.y0.max(o.y0), self.x1.min(o.x1), self.y1.min(o.y1));
        if r.is_empty() { Rect::EMPTY } else { r }
    }
    pub fn translate(&self, dx: i32, dy: i32) -> Rect {
        Rect::new(self.x0.saturating_add(dx), self.y0.saturating_add(dy), self.x1.saturating_add(dx), self.y1.saturating_add(dy))
    }
    pub fn inflate(&self, d: i32) -> Rect {
        Rect::new(self.x0.saturating_sub(d), self.y0.saturating_sub(d), self.x1.saturating_add(d), self.y1.saturating_add(d))
    }
}
