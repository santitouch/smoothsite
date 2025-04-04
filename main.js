// Project: WebGPU Depth Map + Golden Dot Scan Effect + Tilt-Shift Enhancement (No Image Distortion)

const vertexShaderWGSL = `
struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0,  1.0),
        vec2(-1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2( 1.0,  1.0)
    );

    var uv = array<vec2<f32>, 6>(
        vec2(0.0, 1.0),
        vec2(1.0, 1.0),
        vec2(0.0, 0.0),
        vec2(0.0, 0.0),
        vec2(1.0, 1.0),
        vec2(1.0, 0.0)
    );

    var output : VertexOutput;
    output.Position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
    output.uv = uv[vertexIndex];
    return output;
}`;

const vertexShaderWGSL = `
struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0,  1.0),
        vec2(-1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2( 1.0,  1.0)
    );

    var uv = array<vec2<f32>, 6>(
        vec2(0.0, 1.0),
        vec2(1.0, 1.0),
        vec2(0.0, 0.0),
        vec2(0.0, 0.0),
        vec2(1.0, 1.0),
        vec2(1.0, 0.0)
    );

    var output : VertexOutput;
    output.Position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
    output.uv = uv[vertexIndex];
    return output;
}`;

const fragmentShaderWGSL = `
@group(0) @binding(0) var sampler0 : sampler;
@group(0) @binding(1) var img : texture_2d<f32>;
@group(0) @binding(2) var depthMap : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mouseData : vec4<f32>; // x, y, inside, time

fn cellNoise(p: vec2<f32>) -> f32 {
  let cell = floor(p);
  let hash = dot(cell, vec2<f32>(127.1, 311.7));
  return fract(sin(hash) * 43758.5453);
}

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p ,vec2<f32>(12.9898,78.233))) * 43758.5453);
}

fn blurWeight(y: f32, focus: f32, strength: f32) -> f32 {
  let diff = abs(y - focus);
  return 1.0 - smoothstep(0.0, 0.4, diff);
}

@fragment
fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let time = mouseData.w;
    let depth = textureSample(depthMap, sampler0, uv).r;
    var finalColor = textureSample(img, sampler0, uv);

    let gridUV = uv * vec2(350.0);
    let noise = cellNoise(gridUV + vec2(time * 0.15));
    let gridDist = distance(fract(gridUV), vec2(0.5));
    let dotMask = smoothstep(0.22, 0.17, gridDist); // Slightly tighter for small dots

    let luma = dot(finalColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let lumaMask = 1.0 - smoothstep(0.985, 1.015, luma); // Broaden tolerance
    let depthMask = smoothstep(0.65, 0.0, depth); // Slightly higher tolerance

    let distToMouse = distance(uv, mouseData.xy);
    let scanFalloff = smoothstep(0.45, 0.0, distToMouse); // Extended reach

    let rand = hash(floor(gridUV));
    let sizeScale = 0.3 + 0.7 * rand;
    let glowScale = 0.2 + 0.4 * rand;
    let shimmer = 0.4 + 0.6 * sin(time * (0.5 + rand * 2.5) + rand * 50.0);

    let dotOverlay = vec3<f32>(1.0, 0.85, 0.4) * dotMask * shimmer * lumaMask * depthMask * scanFalloff * sizeScale;
    let glow = dotOverlay * glowScale;

    let tiltStrength = 3.5;
    let tiltFocus = 0.5;
    let tilt = blurWeight(uv.y, tiltFocus, tiltStrength);

    finalColor = vec4<f32>(mix(finalColor.rgb, finalColor.rgb + dotOverlay + glow, tilt), 1.0);
    return finalColor;
}`;


// JS remains unchanged
const canvas = document.querySelector('#webgpu-canvas');
const mouse = { x: 0, y: 0, inside: false };
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) / rect.width;
  mouse.y = (e.clientY - rect.top) / rect.height;
});
canvas.addEventListener('mouseenter', () => mouse.inside = true);
canvas.addEventListener('mouseleave', () => mouse.inside = false);

async function initWebGPU() {
  if (!navigator.gpu) throw new Error('WebGPU not supported.');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const img = await loadTexture(device, './assets/image.png', canvas);
  const depthMap = await loadTexture(device, './assets/depth.png');

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: vertexShaderWGSL }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({ code: fragmentShaderWGSL }),
      entryPoint: 'main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const uniformBuffer = device.createBuffer({
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: img.createView() },
      { binding: 2, resource: depthMap.createView() },
      { binding: 3, resource: { buffer: uniformBuffer } },
    ],
  });

  function render() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    const mouseData = new Float32Array([
      mouse.x, mouse.y, mouse.inside ? 1.0 : 0.0, performance.now() / 1000.0,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, mouseData.buffer);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1, 0, 0);
    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(render);
  }

  render();
}

async function loadTexture(device, url, canvas = null) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const bitmap = await createImageBitmap(img);

  if (canvas) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }

  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture: texture },
    [bitmap.width, bitmap.height]
  );
  return texture;
}

initWebGPU();
