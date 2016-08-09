(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.glslGaussian = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

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
      const drawToViewport = regl({
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
      drawToViewport({satTexture: satTexture, fbo: outFbo.fbo, viewport: outFbo.viewport});
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

function makeSubsampleFShader ({resolution, sampleSize, components = 'rgba', type = 'vec4', strategy = 'lower-left'}) {
  let resolutionDecl = '';

  if (resolution === 'uniform') {
    resolutionDecl = 'uniform vec2 u_resolution;';
    resolution = 'u_resolution';
  } else {
    resolutionDecl = `const vec2 resolution = vec2(${resolution.x}, ${resolution.y});`;
    resolution = 'resolution';
  }

  if (strategy === 'average') {
    return `
      precision highp float;

      varying vec2 v_uv;
      uniform sampler2D u_texture;
      ${resolutionDecl}

      const vec2 sample_size = vec2(${sampleSize.x}, ${sampleSize.y});

      void main () {
        ${type} color = vec4(0);

        vec2 sample_ll_uv = v_uv - (((sample_size / 2.0) - .5)/${resolution});

        for (int i = 0; i < ${sampleSize.x}; ++i) {
          for (int j = 0; j < ${sampleSize.y}; ++j) {
            vec2 uv = sample_ll_uv + (vec2(i,j)/${resolution});
            color += texture2D(u_texture, uv).${components};
          }
        }

        color = color / ${sampleSize.x * sampleSize.y};

        gl_FragColor.${components} = color;
      }
    `;
  }

  let sampleSizeDecl = '';
  if (sampleSize === 'uniform') {
    sampleSizeDecl = 'uniform vec2 u_sample_size;';
    sampleSize = 'u_sample_size';
  } else {
    sampleSizeDecl = `const vec2 sample_size = vec2(${sampleSize.x}, ${sampleSize.y});`;
    sampleSize = 'sample_size';
  }

  let uvXForm = 'vec2 uv = v_uv;';

  if (strategy === 'lower-left') {
    uvXForm = `vec2 uv = floor(v_uv * ${resolution} / ${sampleSize}) / ${resolution};`;
    /*
     _____ _____ _____
    |     |     |     |
    |     |     |     |
    |_____|_____|_____|
    |     |     |     |
    |     |  x  |     |
    |_____|_____|_____|
    |     |     |     |
    |  X  |     |     |
    |_____|_____|_____|

    vec2 uv = v_uv - ((sampleSize / 2) - .5);
     _____ _____
    |     |     |
    |     |     |
    |_____x_____|
    |     |     |
    |  X  |     |
    |_____|_____|

    vec2 uv = v_uv - ((sampleSize / 2) - .5);
    */
    uvXForm = `vec2 uv = v_uv - ((${sampleSize} / 2.0) - 0.5) / ${resolution};`;
  } else if (strategy === 'center') {
    uvXForm = 'vec2 uv = v_uv;';
  }

  return `
    precision highp float;

    ${resolutionDecl}
    ${sampleSizeDecl}

    varying vec2 v_uv;
    uniform sampler2D u_texture;

    void main () {
      ${uvXForm}

      ${type} result = texture2D(u_texture, uv).${components};

      gl_FragColor.${components} = result;
    }
  `;
}

function subsample ({ regl, texture, resolution, outFbo, outViewport = null,
                      sampleSize = {x: 2, y: 2},
                      strategy = 'lower-left',
                      clipY = 1,
                      components = 'rgba', type = 'vec4'}) {
  const frag = makeSubsampleFShader({sampleSize, resolution, components, type, strategy});

  const draw = regl({
    vert: quad.shader.vert,
    frag: frag,
    attributes: {
      a_position: quad.verts,
      a_uv: quad.uvs
    },
    elements: quad.indices,
    uniforms: {
      u_texture: regl.prop('texture'),
      u_clip_y: clipY
    },
    framebuffer: regl.prop('fbo')
  });
  const drawToViewport = regl({
    vert: quad.shader.vert,
    frag: frag,
    attributes: {
      a_position: quad.verts,
      a_uv: quad.uvs
    },
    elements: quad.indices,
    uniforms: {
      u_texture: regl.prop('texture'),
      u_clip_y: clipY
    },
    framebuffer: regl.prop('fbo'),
    viewport: regl.prop('viewport')
  });

  if (outViewport !== null && outViewport !== undefined) {
    drawToViewport({texture: texture, fbo: outFbo, viewport: outViewport});
  } else {
    draw({texture: texture, fbo: outFbo});
  }
}

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

module.exports = {blur, subsample};

},{"glsl-quad":2,"glsl-sat":3}],2:[function(require,module,exports){

const verts = [
  [-1.0, -1.0],
  [+1.0, -1.0],
  [-1.0, +1.0],
  [-1.0, +1.0],
  [+1.0, -1.0],
  [+1.0, +1.0]
];

const uvs = [
  [0.0, 0.0],
  [1.0, 0.0],
  [0.0, 1.0],
  [0.0, 1.0],
  [1.0, 0.0],
  [1.0, 1.0]
];

const indices = [
  [0, 1, 2],
  [3, 4, 5]
];

const vshader = `
  precision mediump float;
  attribute vec2 a_position;
  attribute vec2 a_uv;

  uniform float u_clip_y;

  varying vec2 v_uv;
  
  void main() {
    v_uv = a_uv;
    gl_Position = vec4(a_position * vec2(1,u_clip_y), 0, 1);
  }
`;

const fshader = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  void main () {
    gl_FragColor = texture2D(u_tex,v_uv);
  }
`;

const showUVsFshader = `
  precision mediump float;
  varying vec2 v_uv;
  void main () {
    gl_FragColor = vec4(v_uv,0,1);
  }
`;


const showPositionsVshader = `
  precision mediump float;
  attribute vec2 a_position;

  uniform float u_clip_y;

  varying vec2 v_uv;
  
  void main() {
    gl_Position = vec4(a_position * vec2(1,u_clip_y), 0, 1);
    v_uv = gl_Position.xy;
  }
`;

const showPositionsFshader = `
  precision mediump float;
  varying vec2 v_uv;
  void main () {
    gl_FragColor = vec4(v_uv,0,1);
  }
`;

const directionsDataUri = `
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAA
BACAIAAAAlC+aJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQ
UAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAEbSURBVGhD7dhRDsIgEI
RhjubNPHqlHUTAdjfRWRKa+UIirQnd376Z0vZZG1vQsfvB76WAa3
En3yug3GHD0HX6gIZCAaYaEGdSQM2g9yjApADfpIBhTzQvIIgCTA
rwKcCkAJ8CTArwKcCkAN/56Y/8XAZCwH7AsS6sEDBseisEYF1YIW
DY9Lq7eW6Mjk29/Bk/YD+vO7Bc/D/rKULAqSbj80tHrOehPC9mjY
/krhkBeBF4HvZE6CgXRJgeW3wAPYMf0IwO1NO/RL2BhgJMCvApwK
QAnwJMCvApwKQAnwJMCvApwNQGYE/vmRowbCgUYLpbQHvJMi8gSN
TpmLsGxGWsH9Aq90gwfW1gwv9zx+qUr0mWD8hCps/uE5DSC/pgVD
kvIARVAAAAAElFTkSuQmCC`.replace(/\s*/g, '');

const bitmaps = {
  directions: {uri: directionsDataUri}
};

module.exports = {verts, indices, uvs, shader: {vert: vshader, frag: fshader},
                  show: {
                    uvs: {frag: showUVsFshader, vert: vshader},
                    positions: {frag: showPositionsFshader, vert: showPositionsVshader}
                  },
                  bitmaps};

},{}],3:[function(require,module,exports){

const quad = require('glsl-quad');

const makeVert = function makeVert ({passIndex, textureSize, direction}) {
  direction = direction.toLowerCase();

  if (direction !== 'v' && direction !== 'h') {
    // console.error('direction is not "V" or "H" ... direction: ', direction);
    throw new Error('direction is not "V" or "H" ... direction: ' + direction);
  }

  let pixelSize = 1.0 / textureSize;
  let passOffset = Math.pow(16.0, passIndex) * pixelSize;

  let wzOffset = `vec2(${passOffset}, 0)`;
  let xyIOffset = `vec2((2.0 * float(i)) * float(${passOffset}), 0)`;
  let wzIOffset = `vec2((2.0 * float(i) + 1.0) * float(${passOffset}), 0)`;

  // console.log('direction:', direction);
  if (direction === 'v') {
    wzOffset = `vec2(0, ${passOffset})`;
    xyIOffset = `vec2(0, (2.0 * float(i)) * float(${passOffset}))`;
    wzIOffset = `vec2(0, (2.0 * float(i) + 1.0) * float(${passOffset}))`;
  }


  return `
  precision highp float;
  attribute vec2 a_position;
  attribute vec2 a_uv;
  uniform float u_clip_y;
  varying vec4 v_sample_uvs[8];

  
  void main() {
    gl_Position = vec4(a_position*vec2(1,u_clip_y), 0, 1);

    v_sample_uvs[0].xy = a_uv;
    v_sample_uvs[0].wz = v_sample_uvs[0].xy - ${wzOffset};
    for (int i=1; i<8; i++) {
      v_sample_uvs[i].xy = v_sample_uvs[0].xy - ${xyIOffset};
      v_sample_uvs[i].wz = v_sample_uvs[0].xy - ${wzIOffset};
    }
  }`;
};

const makeFrag = function makeFrag ({type = 'vec4', components = 'rgba'}) {
  return `

    precision highp float;
    varying vec4 v_sample_uvs[8];
    uniform highp sampler2D u_tex;
    void main () {

      highp ${type} t[8];
      // add 16 texture samples with pyramidal scheme
      // to maintain precision
      for (int i=0; i<8; i++) {
        highp ${type} lhs, rhs;

        if (any(lessThan(v_sample_uvs[i].xy, vec2(0))) || any(greaterThan(v_sample_uvs[i].xy, vec2(1))))
          lhs = ${type}(0.0);
        else
          lhs = texture2D(u_tex, v_sample_uvs[i].xy).${components};

        if (any(lessThan(v_sample_uvs[i].wz, vec2(0))) || any(greaterThan(v_sample_uvs[i].wz, vec2(1))))
          rhs = ${type}(0.0);
        else
          rhs = texture2D(u_tex, v_sample_uvs[i].wz).${components};

        t[i] = lhs + rhs;
      }
      t[0] += t[1]; t[2] += t[3];
      t[4] += t[5]; t[6] += t[7];
      t[0] += t[2]; t[4] += t[6];

      highp ${type} result = (t[0] + t[4]);

      gl_FragColor = vec4(1);
      // gl_FragColor = vec4(v_sample_uvs[0].y,0,0,1);
      gl_FragColor.${components} = result.${components};
      // gl_FragColor = texture2D(u_tex, v_sample_uvs[0].xy);

    }
  `;
};

function logtobase ({value, base}) {
  return Math.log(value) / Math.log(base);
}

function computeNumPasses ({textureSize, sampleSize}) {
  return Math.ceil(logtobase({value: textureSize, base: sampleSize}));
}
function computeNumBitsRequired ({width, height, channelBitDepth}) {
  return Math.ceil(Math.log2(width)) + Math.ceil(Math.log2(height)) + channelBitDepth;
}

function runPasses ({regl, inputTexture, textureSize, direction, passes, currentFboIndex, fbos, type = 'vec4', components = 'rgba', clipY = 1, outFbo = null}) {
  for (let passIndex = 0; passIndex < passes; ++passIndex) {
    let passInTtexture = passIndex === 0 ? inputTexture : fbos[currentFboIndex].color[0];

    let vert = makeVert({ passIndex, textureSize: textureSize, direction: direction });
    let frag = makeFrag({type, components});

    const draw = regl({
      vert: vert,
      frag: frag,
      attributes: {
        a_position: quad.verts,
        a_uv: quad.uvs
      },
      elements: quad.indices,
      uniforms: {
        u_clip_y: clipY,
        u_tex: regl.prop('texture')
      },
      framebuffer: regl.prop('fbo')
    });

    if (outFbo !== null && outFbo !== undefined && passIndex === passes - 1) {
      // if runPasses was passed an outFbo, we want to write to that.
      draw({texture: passInTtexture, fbo: outFbo});
    } else {
      // otherwise ping-pong to the next intermediary fbo
      currentFboIndex += 1;
      currentFboIndex %= fbos.length;
      // console.log('writing to currentFboIndex: ',currentFboIndex)
      draw({texture: passInTtexture, fbo: fbos[currentFboIndex]});
    }
  }

  return {currentFboIndex};
}

function computeSat ({regl, texture, fbos, currentFboIndex = 0, outFbo = null, components = 'rgba', type = 'vec4', clipY = 1}) {
  // http://developer.amd.com/wordpress/media/2012/10/GDC2005_SATEnvironmentReflections.pdf

  if (fbos.length < 2) {
    throw new Error('fbos.length must be >= 2');
  }

  let sampleSize = 16;
  let textureSize = Math.max(texture.width, texture.height);

  let passes = computeNumPasses({textureSize, sampleSize});

  ({currentFboIndex} = runPasses({inputTexture: texture,
                                  textureSize,
                                  direction: 'V',
                                  passes,
                                  currentFboIndex,
                                  fbos,
                                  type,
                                  components,
                                  clipY,
                                  regl,
                                  outFbo: null}));
  ({currentFboIndex} = runPasses({inputTexture: fbos[currentFboIndex].color[0],
                                  textureSize,
                                  direction: 'H',
                                  passes,
                                  currentFboIndex,
                                  fbos,
                                  type,
                                  components,
                                  clipY,
                                  regl,
                                  outFbo: outFbo}));

  return {currentFboIndex};
}

module.exports = {computeSat, makeFrag, makeVert, computeNumPasses, computeNumBitsRequired, runPasses};

},{"glsl-quad":2}]},{},[1])(1)
});