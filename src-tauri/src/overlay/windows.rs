//! Windows-specific overlay implementation using Win32 API.
//!
//! Uses WS_EX_LAYERED and WS_EX_TRANSPARENT for click-through behavior.
//! Supports selective input regions via SetWindowRgn.

use tauri::{Runtime, Window};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn, HRGN};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
};

/// Get the HWND from a Tauri window.
fn get_hwnd<R: Runtime>(window: &Window<R>) -> Result<HWND, String> {
    window
        .hwnd()
        .map(|hwnd| HWND(hwnd.0 as *mut _))
        .map_err(|e| format!("Failed to get HWND: {}", e))
}

/// Enable or disable click-through for the entire window.
/// Uses WS_EX_TRANSPARENT extended window style.
pub fn set_click_through<R: Runtime>(window: &Window<R>, enabled: bool) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;

    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;

        let new_style = if enabled {
            // Add TRANSPARENT and LAYERED for click-through
            ex_style | WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0
        } else {
            // Remove TRANSPARENT but keep LAYERED for transparency
            (ex_style & !WS_EX_TRANSPARENT.0) | WS_EX_LAYERED.0
        };

        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style as isize);

        // Apply the style change
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
        .map_err(|e| format!("Failed to apply window style: {}", e))?;
    }

    Ok(())
}

/// Set a specific rectangular region that accepts input.
/// Uses SetWindowRgn to define the clickable area.
pub fn set_input_region<R: Runtime>(
    window: &Window<R>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;

    unsafe {
        // First, ensure WS_EX_TRANSPARENT is NOT set (we want input in the region)
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let new_style = (ex_style & !WS_EX_TRANSPARENT.0) | WS_EX_LAYERED.0;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style as isize);

        // Create a rectangular region for the input area
        let region = CreateRectRgn(x, y, x + width, y + height);
        if region.is_invalid() {
            return Err("Failed to create region".to_string());
        }

        // Set the window region (the region is now owned by the window)
        // bRedraw = true to redraw the window
        let result = SetWindowRgn(hwnd, region, true);
        if result == 0 {
            // If SetWindowRgn fails, we need to delete the region ourselves
            let _ = DeleteObject(region);
            return Err("Failed to set window region".to_string());
        }

        // Apply changes
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
        .map_err(|e| format!("Failed to apply window region: {}", e))?;
    }

    Ok(())
}

/// Clear the input region, making the entire window accept input.
pub fn clear_input_region<R: Runtime>(window: &Window<R>) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;

    unsafe {
        // Remove WS_EX_TRANSPARENT
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let new_style = (ex_style & !WS_EX_TRANSPARENT.0) | WS_EX_LAYERED.0;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style as isize);

        // Clear the window region by passing NULL
        // This makes the entire window accept input
        SetWindowRgn(hwnd, HRGN::default(), true);

        // Apply changes
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
        .map_err(|e| format!("Failed to clear window region: {}", e))?;
    }

    Ok(())
}

/// Enable overlay mode for the window.
/// Sets appropriate extended styles for a desktop pet.
pub fn set_overlay_mode<R: Runtime>(window: &Window<R>, enabled: bool) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;

    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;

        let new_style = if enabled {
            // Add LAYERED for transparency support and TOOLWINDOW to hide from taskbar
            (ex_style | WS_EX_LAYERED.0 | WS_EX_TOOLWINDOW.0) & !WS_EX_TRANSPARENT.0
        } else {
            // Remove overlay-specific styles
            ex_style & !WS_EX_LAYERED.0 & !WS_EX_TOOLWINDOW.0 & !WS_EX_TRANSPARENT.0
        };

        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style as isize);

        // Set or unset topmost
        let z_order = if enabled {
            HWND_TOPMOST
        } else {
            HWND(std::ptr::null_mut()) // HWND_NOTOPMOST
        };

        SetWindowPos(
            hwnd,
            z_order,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
        .map_err(|e| format!("Failed to set overlay mode: {}", e))?;
    }

    Ok(())
}
