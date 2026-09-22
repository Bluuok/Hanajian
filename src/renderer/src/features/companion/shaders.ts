// Original gaze warp with a matching silhouette sample to remove the backdrop.
export const vertexShader =
  'attribute vec2 position; varying vec2 uv; void main(){uv=vec2((position.x+1.0)*0.5,(1.0-position.y)*0.5);gl_Position=vec4(position,0.0,1.0);}'
export const fragmentShader = `precision highp float;
varying vec2 uv;uniform sampler2D photo;uniform sampler2D silhouette;uniform vec2 gaze;uniform float strength;
const vec2 size=vec2(1086.0,1448.0);
vec2 rotate2(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}
vec2 eyeWarp(vec2 p,vec2 center,vec2 radii,float angle,vec2 movement){
  vec2 local=rotate2(p-center,-angle);float radius=length(local/radii);
  float weight=1.0-smoothstep(0.53,1.0,radius);
  return p-movement*weight;
}
void main(){
  vec2 p=uv*size;vec2 look=gaze*strength;
  // The inverse image warp moves the head, with a smooth fixed collar boundary.
  float headWeight=1.0-smoothstep(672.0,795.0,p.y);
  vec2 pivot=vec2(545.0,725.0);
  vec2 head=rotate2(p-pivot-vec2(look.x*8.0,look.y*5.0),-look.x*0.045);
  head.x/=1.0-abs(look.x)*0.025;
  head.y/=1.0+look.y*0.017;
  p=mix(p,head+pivot,headWeight);
  // Only the eye interiors deform; the outer lid contours remain fixed.
  vec2 movement=vec2(look.x*12.0,look.y*8.0);
  p=eyeWarp(p,vec2(396.0,505.0),vec2(54.0,69.0),0.18,movement);
  p=eyeWarp(p,vec2(631.0,550.0),vec2(53.0,66.0),0.18,movement);
  vec2 sampleUv=clamp(p/size,0.0,1.0);
  vec4 color=texture2D(photo,sampleUv);
  color.a*=texture2D(silhouette,sampleUv).a;
  gl_FragColor=color;
}`
