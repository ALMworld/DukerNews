import { useRef, useEffect, useCallback } from 'react';

/* ── WebGL Simplex Noise Glow Shader ── */
const VERT = `attribute vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0,1); }`;

function buildFrag(bgR: number, bgG: number, bgB: number) {
    return `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;

#define TAU 6.2831852
#define MOD3 vec3(.1031,.11369,.13787)

vec3 hash33(vec3 p3){
  p3=fract(p3*MOD3);
  p3+=dot(p3,p3.yxz+19.19);
  return -1.0+2.0*fract(vec3((p3.x+p3.y)*p3.z,(p3.x+p3.z)*p3.y,(p3.y+p3.z)*p3.x));
}

float simplex_noise(vec3 p){
  const float K1=0.333333333;
  const float K2=0.166666667;
  vec3 i=floor(p+(p.x+p.y+p.z)*K1);
  vec3 d0=p-(i-(i.x+i.y+i.z)*K2);
  vec3 e=step(vec3(0.0),d0-d0.yzx);
  vec3 i1=e*(1.0-e.zxy);
  vec3 i2=1.0-e.zxy*(1.0-e);
  vec3 d1=d0-(i1-1.0*K2);
  vec3 d2=d0-(i2-2.0*K2);
  vec3 d3=d0-(1.0-3.0*K2);
  vec4 h=max(0.6-vec4(dot(d0,d0),dot(d1,d1),dot(d2,d2),dot(d3,d3)),0.0);
  vec4 n=h*h*h*h*vec4(dot(d0,hash33(i)),dot(d1,hash33(i+i1)),dot(d2,hash33(i+i2)),dot(d3,hash33(i+1.0)));
  return dot(vec4(31.316),n);
}

void main(){
  vec2 uv=(gl_FragCoord.xy-u_res.xy*0.5)/u_res.y * 1.8;
  float a=sin(atan(uv.y,uv.x));
  float am=abs(a-.5)/4.;
  float l=length(uv);
  float m1=clamp(.1/smoothstep(.0,1.2,l),0.,1.);
  float m2=clamp(.1/smoothstep(.3,0.,l),0.,1.);
  float s1=(simplex_noise(vec3(uv*2.,1.+u_time*.525))*(max(1.0-l*2.2,0.))+.9);
  float s2=(simplex_noise(vec3(uv*1.,15.+u_time*.525))*(max(.0+l*1.,.025))+1.25);
  float s3=(simplex_noise(vec3(vec2(am,am*100.+u_time*1.)*.15,30.+u_time*.525))*(max(.0+l*1.,.025))+1.25);
  s3*=smoothstep(0.0,.25,l);
  float sh=smoothstep(0.1,.25,l);
  float sh2=smoothstep(0.55,.2,l);
  float m=m1*m2*((s1*s2*s3)*(1.-l))*sh*sh2;
  m=m*m;
  // Tint with purple, blend to theme bg color
  vec3 glowCol=vec3(0.55,0.2,0.9)*m;
  vec3 bgCol=vec3(${bgR.toFixed(4)},${bgG.toFixed(4)},${bgB.toFixed(4)});
  vec3 col=glowCol+bgCol*(1.0-m);
  gl_FragColor=vec4(col,1.0);
}
`;
}

function hexToGL(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16) / 255,
        parseInt(h.substring(2, 4), 16) / 255,
        parseInt(h.substring(4, 6), 16) / 255,
    ];
}

export function ShaderCanvas({ className, bgColor = '#140520' }: { className?: string; bgColor?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const glRef = useRef<{ gl: WebGLRenderingContext; uTime: WebGLUniformLocation; uRes: WebGLUniformLocation } | null>(null);
    const bgRef = useRef(bgColor);

    const init = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl', { alpha: false });
        if (!gl) return;

        const [r, g, b] = hexToGL(bgRef.current);
        const fragSrc = buildFrag(r, g, b);

        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src); gl.compileShader(s);
            return s;
        };
        const prog = gl.createProgram()!;
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
        gl.linkProgram(prog); gl.useProgram(prog);

        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

        glRef.current = {
            gl,
            uTime: gl.getUniformLocation(prog, 'u_time')!,
            uRes: gl.getUniformLocation(prog, 'u_res')!,
        };
    }, []);

    // Re-init when bgColor changes
    useEffect(() => {
        bgRef.current = bgColor;
        glRef.current = null;
        init();
    }, [bgColor, init]);

    useEffect(() => {
        init();
        const start = performance.now();
        let lastFrame = 0;
        const FRAME_INTERVAL = 1000 / 30; // 30fps
        const tick = (now: number) => {
            rafRef.current = requestAnimationFrame(tick);
            if (now - lastFrame < FRAME_INTERVAL) return;
            lastFrame = now;
            const g = glRef.current;
            const canvas = canvasRef.current;
            if (!g || !canvas) return;
            // Half-res for performance — CSS scales up
            const w = Math.ceil(canvas.clientWidth / 2);
            const h = Math.ceil(canvas.clientHeight / 2);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            g.gl.viewport(0, 0, w, h);
            g.gl.uniform2f(g.uRes, w, h);
            g.gl.uniform1f(g.uTime, (performance.now() - start) / 1000);
            g.gl.drawArrays(g.gl.TRIANGLE_STRIP, 0, 4);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [init]);

    return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: '100%', borderRadius: 16 }} />;
}

export default ShaderCanvas;
