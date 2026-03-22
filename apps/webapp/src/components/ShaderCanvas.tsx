import { useRef, useEffect, useCallback } from 'react';

/* ── WebGL Shader Background ── */
const VERT = `attribute vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0,1); }`;
const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
#define M_PI 3.141592
float radial(vec2 uv,float offset,float repeat){
  float a=mod((atan(uv.y,uv.x)+M_PI+(offset*2.0*M_PI))*repeat/M_PI,2.0);
  return min(a,2.0-a);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*u_res)/u_res.y * 2.5;
  float _d=length(uv);
  float d=_d-0.75;
  float off=_d;
  float a=radial(uv,sin(off*6.0-u_time*0.8)*0.161,7.0)-0.9;
  d=off-d*d+d+a*a+d;
  float m=_d+d+off;
  vec3 col=mix(vec3(0.1,0.1,0.19),vec3(0.18,0.13,0.31),m);
  col=(col-off*off)+d+a;
  vec3 bg=vec3(0.32,0.1,0.68);
  float m2=col.r+col.g+col.b*0.25;
  col=mix(bg,col,m2);
  col*=_d-0.01;
  gl_FragColor=vec4(col,1.0);
}
`;

export function ShaderCanvas({ className }: { className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const glRef = useRef<{ gl: WebGLRenderingContext; uTime: WebGLUniformLocation; uRes: WebGLUniformLocation } | null>(null);

    const init = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl', { alpha: false });
        if (!gl) return;

        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src); gl.compileShader(s);
            return s;
        };
        const prog = gl.createProgram()!;
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
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

    useEffect(() => {
        init();
        const start = performance.now();
        const tick = () => {
            const g = glRef.current;
            const canvas = canvasRef.current;
            if (!g || !canvas) { rafRef.current = requestAnimationFrame(tick); return; }
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            g.gl.viewport(0, 0, w, h);
            g.gl.uniform2f(g.uRes, w, h);
            g.gl.uniform1f(g.uTime, (performance.now() - start) / 1000);
            g.gl.drawArrays(g.gl.TRIANGLE_STRIP, 0, 4);
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [init]);

    return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: '100%', borderRadius: 16 }} />;
}

export default ShaderCanvas;
