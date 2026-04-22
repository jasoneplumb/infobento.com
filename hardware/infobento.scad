// InfoBento Dual-Display Clamshell Mockup
// For 3D printing (FDM, PLA/PETG) via PCBWay
// Units: millimeters
//
// Two halves connected by a hinge channel along the short edge.
// Print each half separately, connect with a Reell TI-C5M hinge
// or a simple pin hinge for the mockup.
//
// Display half: 3.2mm — two full-size eInk panels back-to-back + ESP32-C3
// Battery on solar half — avoids grip flex stress on the LiPo cell.
// Power routed through hinge FPC (2 wires, ~100mA, proven safe).

// === Device dimensions ===
device_width = 70.6;      // Short edge (matches iPhone 15 Pro width)
device_height = 140;       // Long edge (slightly shorter than iPhone)
corner_radius = 3;         // Rounded corners

// === Display half ===
display_half_thickness = 3.2;  // 1.2mm D panel + 0.8mm PCB + 1.2mm P panel

// eInk panel recesses (both sides)
panel_width = 37;          // 2.9" panel short dimension (portrait)
panel_height = 79;         // 2.9" panel long dimension
panel_depth = 1.2;         // Glass panel thickness
panel_x_offset = (device_width - panel_width) / 2;  // Centered horizontally
panel_y_offset = 10;       // Offset from hinge edge

// ESP32-C3-MINI-1 recess (between panels, beside eInk area)
// Positioned at board edge for antenna clearance from MagSafe metal
esp_width = 13.2;
esp_height = 16.6;
esp_depth = 2.4;
esp_x_offset = 5;          // Near board edge for antenna clearance
esp_y_offset = panel_y_offset + panel_height + 5;

// === Solar half ===
// Battery lives here — mechanically isolated from hand-grip forces
// GM251534: 2.5mm thick, 100mAh, 15x34mm
battery_width = 15;
battery_height = 34;
battery_depth = 2.5;
battery_x_offset = 4;
battery_y_offset = 15;

// Thicker to accommodate battery between solar panel and MagSafe/Qi layers
solar_half_thickness = 4.0;  // 0.8 PCB + 2.5 battery + 0.5 solar + 0.2 margin

// Solar panel recess (inner face, S-side)
solar_width = device_width - 8;   // Nearly full width
solar_height = 100;
solar_depth = 0.5;                 // Shallow recess for thin film
solar_x_offset = 4;
solar_y_offset = 15;

// MagSafe ring recess (outer face, M-side)
magsafe_od = 54;
magsafe_id = 46;
magsafe_depth = 1.0;       // Recess for magnet ring
magsafe_center_x = device_width / 2;
magsafe_center_y = device_height / 2;

// === Hinge ===
hinge_diameter = 6;         // Barrel diameter for pin hinge
hinge_length = device_width - 4;  // Slightly shorter than device width
hinge_pin_diameter = 2.5;  // Pin that connects the two halves

// === Weight insert holes (simulate battery/PCB mass) ===
// Use coins or steel washers — 20mm diameter, 2mm deep
weight_hole_diameter = 20;
weight_hole_depth = 2;

// === Modules ===

module rounded_rect(w, h, t, r) {
    // Rounded rectangle as a hull of 4 cylinders
    hull() {
        translate([r, r, 0]) cylinder(h=t, r=r, $fn=32);
        translate([w-r, r, 0]) cylinder(h=t, r=r, $fn=32);
        translate([r, h-r, 0]) cylinder(h=t, r=r, $fn=32);
        translate([w-r, h-r, 0]) cylinder(h=t, r=r, $fn=32);
    }
}

module hinge_barrel(is_left=true) {
    // Half-barrel with pin hole
    difference() {
        // Barrel
        translate([0, 0, 0])
            rotate([0, 90, 0])
                cylinder(h=hinge_length/2, d=hinge_diameter, $fn=32);
        // Pin hole
        translate([-1, 0, 0])
            rotate([0, 90, 0])
                cylinder(h=hinge_length/2 + 2, d=hinge_pin_diameter, $fn=24);
    }
}

// === Display Half ===
module display_half() {
    difference() {
        // Main body
        rounded_rect(device_width, device_height, display_half_thickness, corner_radius);

        // D-side panel recess (top face, outer display)
        translate([panel_x_offset, panel_y_offset, display_half_thickness - panel_depth])
            cube([panel_width, panel_height, panel_depth + 0.1]);

        // P-side panel recess (bottom face, inner display)
        translate([panel_x_offset, panel_y_offset, -0.1])
            cube([panel_width, panel_height, panel_depth + 0.1]);

        // ESP32 recess (between panels, near board edge for antenna)
        translate([esp_x_offset, esp_y_offset, display_half_thickness/2 - esp_depth/2])
            cube([esp_width, esp_height, esp_depth]);

        // Weight insert hole (D-side, for mockup mass simulation)
        translate([device_width/2, device_height - 30, display_half_thickness - weight_hole_depth])
            cylinder(d=weight_hole_diameter, h=weight_hole_depth + 0.1, $fn=32);
    }

    // Hinge barrel (at y=0 edge, left side)
    translate([2, -hinge_diameter/2, display_half_thickness/2])
        hinge_barrel(true);
}

// === Solar Half ===
module solar_half() {
    difference() {
        // Main body
        rounded_rect(device_width, device_height, solar_half_thickness, corner_radius);

        // Solar panel recess (inner face, S-side, bottom)
        translate([solar_x_offset, solar_y_offset, -0.1])
            cube([solar_width, solar_height, solar_depth + 0.1]);

        // Battery recess (internal, between solar panel and MagSafe layers)
        // Mechanically isolated from grip forces — solar half is never squeezed
        translate([battery_x_offset, battery_y_offset, solar_half_thickness/2 - battery_depth/2])
            cube([battery_width, battery_height, battery_depth]);

        // MagSafe ring recess (outer face, M-side, top)
        translate([magsafe_center_x, magsafe_center_y, solar_half_thickness - magsafe_depth]) {
            difference() {
                cylinder(d=magsafe_od, h=magsafe_depth + 0.1, $fn=64);
                translate([0, 0, -0.1])
                    cylinder(d=magsafe_id, h=magsafe_depth + 0.3, $fn=64);
            }
        }

        // Weight insert hole (M-side)
        translate([device_width/2, device_height - 30, solar_half_thickness - weight_hole_depth])
            cylinder(d=weight_hole_diameter, h=weight_hole_depth + 0.1, $fn=32);
    }

    // Hinge barrel (at y=0 edge, right side)
    translate([device_width/2 + 2, -hinge_diameter/2, solar_half_thickness/2])
        hinge_barrel(false);
}

// === Assembly view ===
// Lay both halves side by side for printing, or use the closed view

// Print layout: both halves flat, separated
module print_layout() {
    display_half();
    translate([device_width + 10, 0, 0])
        solar_half();
}

// Closed view: stacked (for visualization)
module closed_view() {
    display_half();
    translate([0, 0, display_half_thickness + 0.5])
        mirror([0, 0, 1])
            translate([0, 0, -solar_half_thickness])
                solar_half();
}

// === Render ===
// Uncomment the view you want:

print_layout();      // For 3D printing — two halves side by side
// closed_view();    // For visualization — stacked as if closed
