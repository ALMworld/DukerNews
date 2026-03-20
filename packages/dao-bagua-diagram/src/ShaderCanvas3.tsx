import { useRef, useEffect, useCallback } from 'react';

/* ── WebGL Light Ring Shader ── */
const VERT = `attribute vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0,1); }`;
const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;

void main(){
  vec2 uv=1.5*(2.0*gl_FragCoord.xy-u_res.xy)/u_res.y;
  vec2 offset=vec2(cos(u_time/2.0)*0.5,sin(u_time/2.0)*0.5);

  vec3 light_color=vec3(0.6,0.3,0.9);
  float light=0.1/distance(normalize(uv),uv);

  if(length(uv)<1.0){
    light*=0.1/distance(normalize(uv-offset),uv-offset);
  }

  gl_FragColor=vec4(light*light_color,1.0);
}
`;

export function ShaderCanvas3({ className }: { className?: string }) {
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

export default ShaderCanvas3;
