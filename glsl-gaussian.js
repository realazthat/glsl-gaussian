
const quad = require('glsl-quad');
const sat = require('glsl-sat');

function makeBoxBlurVShader ({textureWidth, textureHeight, radius, components = 'rgba', type = 'vec4'}) {
  const hradius = (1 / textureWidth) * radius;
  const vradius = (1 / textureHeight) * radius;

  const upperOffset = `vec2( ${hradius}, ${vradius})`;
  const lowerOffset = `vec2(-${hradius + 1.0 / textureWidth}, -${vradius + 1.0 / textureHeight})`;

  const vert = `
    precision highp float;
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_upper;
    varying vec2 v_lower;
    varying vec2 v_UL;
    varying vec2 v_LR;
    const vec2 upper_offset = ${upperOffset};
    const vec2 lower_offset = ${lowerOffset};
    uniform float u_clip_y;
    
    void main() {
      v_upper = a_uv + upper_offset;
      v_lower = a_uv + lower_offset;
      v_UL = a_uv + vec2(lower_offset.x, upper_offset.y);
      v_LR = a_uv + vec2(upper_offset.x, lower_offset.y);
      gl_Position = vec4(a_position.xy * vec2(1, u_clip_y), 0, 1);
    }
  `;
  return vert;
}

function makeBoxBlurFShader ({textureWidth, textureHeight, radius, components = 'rgba', type = 'vec4'}) {
  const pixelDelta = `1.0/vec2(${textureWidth}, ${textureHeight})`;
  const area = (2 * radius + 1) * (2 * radius + 1);
  const frag = `
    precision highp float;

    const highp float kernel_area = float(${area});
    const highp vec2 pixel_delta = ${pixelDelta};
    const highp vec2 min_lower = vec2(0) - (pixel_delta / 2.0);
    const highp vec2 max_upper = vec2(1) - (pixel_delta / 2.0);
    varying vec2 v_upper;
    varying vec2 v_lower;
    varying vec2 v_UL;
    varying vec2 v_LR;
    uniform sampler2D u_sat_texture;
    void main () {
      highp ${type} result = ${type}(0);
      result += texture2D(u_sat_texture, v_upper).${components};
      result -= any(lessThan(v_UL, vec2(0))) ? ${type}(0.0) : texture2D(u_sat_texture, v_UL).${components};
      result -= any(lessThan(v_LR, vec2(0))) ? ${type}(0.0) : texture2D(u_sat_texture, v_LR).${components};
      result += any(lessThan(v_lower, vec2(0))) ? ${type}(0.0) : texture2D(u_sat_texture, v_lower).${components};

      vec2 actual_lower = max(v_lower, min_lower);
      vec2 actual_upper = min(v_upper, max_upper);

      vec2 actual_kernel_surface = (actual_upper - actual_lower)/pixel_delta;
      float actual_kernel_area = actual_kernel_surface.x * actual_kernel_surface.y;
      result /= actual_kernel_area;

      gl_FragColor = vec4(1);
      gl_FragColor.${components} = result;
    }
  `;
  return frag;
}

function computeBoxBlur ({regl, src, radius, outFbo = null, components = 'rgba', type = 'vec4', clipY = 1}) {
  if ((outFbo === null || outFbo === undefined) && (src.fbos === null || src.fbos === undefined)) {
    throw new Error('`outFbo` is null and `src.fbos` is null; nowhere to put output');
  }

  let satTexture = src.satTexture;
  let currentFboIndex = src.currentFboIndex;

  if (satTexture === undefined || satTexture === null) {
    ({currentFboIndex} = sat.computeSat({regl, texture: src.texture, fbos: src.fbos, currentFboIndex: src.currentFboIndex, components, type, clipY}));
    src.currentFboIndex = currentFboIndex;
    satTexture = src.fbos[src.currentFboIndex].color[0];
  }

  const textureWidth = satTexture.width;
  const textureHeight = satTexture.height;

  const vert = makeBoxBlurVShader({textureWidth, textureHeight, radius, components, type});
  const frag = makeBoxBlurFShader({textureWidth, textureHeight, radius, components, type});

  const draw = regl({
    vert: vert,
    frag: frag,
    attributes: {
      a_position: quad.verts,
      a_uv: quad.uvs
    },
    elements: quad.indices,
    uniforms: {
      u_sat_texture: regl.prop('satTexture'),
      u_clip_y: clipY
    },
    framebuffer: regl.prop('fbo')
  });
  
  if (outFbo !== undefined && outFbo !== null) {
    if (outFbo.fbo !== null && outFbo.fbo !== undefined) {
      const drawViaViewport = regl({
        vert: vert,
        frag: frag,
        attributes: {
          a_position: quad.verts,
          a_uv: quad.uvs
        },
        elements: quad.indices,
        uniforms: {
          u_sat_texture: regl.prop('satTexture'),
          u_clip_y: clipY
        },
        framebuffer: regl.prop('fbo'),
        viewport: regl.prop('viewport')
      });
      drawViaViewport({satTexture: satTexture, fbo: outFbo.fbo, viewport: outFbo.viewport});
    } else {
      draw({satTexture: satTexture, fbo: outFbo});
    }
  } else {
    src.currentFboIndex = (src.currentFboIndex + 1) % src.fbos.length;
    draw({satTexture: satTexture, fbo: src.fbos[src.currentFboIndex]});
  }
  return {currentFboIndex};
}

function computeGaussian ({ regl, texture, radius, fbos, currentFboIndex = 0
                          , boxPasses = 3, outFbo = null, components = 'rgba', type = 'vec4', clipY = 1}) {
  if (fbos.length < 2) {
    throw new Error('fbos.length must be at least 2');
  }

  let lastBoxBlurPass = boxPasses - 1;

  for (let boxBlurPass = 0; boxBlurPass < boxPasses; ++boxBlurPass) {
    let passInTexture = fbos[currentFboIndex].color[0];
    if (boxBlurPass === 0) {
      passInTexture = texture;
    }

    ({currentFboIndex} = sat.computeSat({regl, texture: passInTexture, fbos: fbos, currentFboIndex, components, type, clipY}));

    let satFbo = fbos[currentFboIndex];

    if (boxBlurPass === lastBoxBlurPass && (outFbo !== null && outFbo !== undefined)) {
      computeBoxBlur({regl, radius, src: {satTexture: satFbo.color[0]}, outFbo: outFbo, components, type, clipY});
      break;
    }

    currentFboIndex = (currentFboIndex + 1) % fbos.length;
    let blurredFbo = fbos[currentFboIndex];
    computeBoxBlur({regl, radius, src: {satTexture: satFbo.color[0]}, outFbo: blurredFbo, components, type, clipY});
  }

  return {currentFboIndex};
}

// function makeSubsampleVShader () {
//   return `
//     precision medium float;
//     attribute vec2 a_position;
//     attribute vec2 a_uv;
//     uniform float u_clip_y;

//     varying vec2 v_uv;

//     void main() {
//       v_uv = a_uv;

//       gl_Position = vec4(a_position.xy * vec2(1, u_clip_y), 0, 1);
//     }
//   `;
// }

// function makeSubsampleFShader (sourceSize, destinationSize, components = 'rgba', type = 'vec4') {
//   return `
//     precision highp float;

//     varying vec2 v_uv;
//     uniform sampler2D u_texture;

//     void main () {

//       gl_FragColor.${components} = result;
//     }
//   `;
// }

// function subSample ({texture, outFbo}) {

//   const draw = regl({
//       frag: frag,
//       vert: vert,
//       attributes: {
//           a_position: quad.verts,
//           a_uv: quad.uvs
//       },
//       elements: quad.indices,
//       uniforms: {
//           u_texture: regl.prop('texture'),
//           u_clip_y: clipY
//       },
//       framebuffer: regl.prop('fbo')
//   });
// }

const blur = {
  box: {
    shader: {
      vert: makeBoxBlurVShader,
      frag: makeBoxBlurFShader
    },
    compute: computeBoxBlur
  },
  gaussian: {
    compute: computeGaussian
  }
};

module.exports = {blur};
