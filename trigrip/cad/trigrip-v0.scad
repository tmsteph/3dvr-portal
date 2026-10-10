// 3DVR TriGrip v0.1 - experimental flat-print mechanical layout
// Open hardware concept; NOT load rated. Units mm.
$fn=48;
arm_length=70;
arm_width=13;
arm_thickness=5;
hole_diameter=4.2;
corner_radius=3;
module rounded_arm(length=arm_length,width=arm_width,thickness=arm_thickness){
 difference(){
  linear_extrude(height=thickness) hull(){translate([width/2,width/2])circle(r=width/2);translate([length-width/2,width/2])circle(r=width/2);}
  for(x=[width/2,length-width/2])translate([x,width/2,-1])cylinder(h=thickness+2,d=hole_diameter);
 }
}
// Three flat arms with bolt-through pivot holes; assemble with M4 hardware.
for(i=[0:2])translate([0,i*20,0])rounded_arm();
// Separate triangular hub plate with three bolt holes.
translate([95,0,0])difference(){
 linear_extrude(height=5)offset(r=3)polygon([[0,0],[48,0],[24,42]]);
 for(p=[[4,5],[44,5],[24,35]])translate([p[0],p[1],-1])cylinder(h=7,d=hole_diameter);
}
// Stand-off spacers (experiment with stack clearances).
for(i=[0:5])translate([105+i*13,65,0])difference(){cylinder(h=3,d=11);translate([0,0,-1])cylinder(h=5,d=hole_diameter);}
