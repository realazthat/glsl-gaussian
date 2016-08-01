
const $ = require('jquery-browserify');
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float'],
  // TODO: FIXME: dunno why we need this here, we do not read non-uint8 data from screen,
  // but it fails without this on gh-pages for some reason.
  attributes: {preserveDrawingBuffer: true}
});

const gaussian = require('./glsl-gaussian.js');
const numerify = require('glsl-numerify');
const quad = require('glsl-quad');

// command to copy a texture to an FBO, assumes the texture is in opengl-order
// where the origin is the lower left of the texture.
const drawTextureToFbo = regl({
  frag: quad.shader.frag,
  vert: quad.shader.vert,
  attributes: {
    a_position: quad.verts,
    a_uv: quad.uvs
  },
  elements: quad.indices,
  uniforms: {
    u_tex: regl.prop('texture'),
    u_clip_y: 1
  },
  framebuffer: regl.prop('fbo')
});

// command to copy a texture to an FBO, but flipping the Y axis so that the uvs begin
// at the upper right corner, so that it can be drawn to canvas etc.
const drawToCanvasFBO = regl({
  frag: quad.shader.frag,
  vert: quad.shader.vert,
  attributes: {
    a_position: quad.verts,
    a_uv: quad.uvs
  },
  elements: quad.indices,
  uniforms: {
    u_tex: regl.prop('texture'),
    u_clip_y: -1
  },
  framebuffer: regl.prop('fbo')
});

function dataURIFromFBO ({fbo, width, height, regl}) {
  let canvasFBO = regl.framebuffer({
    color: regl.texture({
      width: width,
      height: height,
      stencil: false,
      format: 'rgba',
      type: 'uint8',
      depth: false,
      wrap: 'clamp',
      mag: 'nearest',
      min: 'nearest'
    })
  });

  let data = [];
  try {
    drawToCanvasFBO({texture: fbo.color[0], fbo: canvasFBO});

    let bindFbo = regl({framebuffer: canvasFBO});
    bindFbo(function () {
      data = regl.read();
    });
  } finally {
    canvasFBO.destroy();
  }

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var context = canvas.getContext('2d');

  // Copy the pixels to a 2D canvas
  var imageData = context.createImageData(width, height);
  imageData.data.set(data);
  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
}



resl({
  manifest: {
    texture: {
      type: 'image',
      src: 'Storm Cell Over the Southern Appalachian Mountains-dsc_2303_0-256x256.png',
      parser: (data) => regl.texture({
        data: data,
        mag: 'nearest',
        min: 'nearest',
        flipY: true
      })
    }, digitsTexture: {
      type: 'image',
      src: numerify.digits.uri,
      parser: (data) => regl.texture({
        data: data,
        mag: 'nearest',
        min: 'nearest',
        flipY: true
      })
    }
  },
  onDone: ({texture, digitsTexture}) => {
    // make a bunch of fbos for ping-ponging intermediate computations, and the output buffer etc.
    let fbos = [null, null, null, null].map(function () {
      return regl.framebuffer({
        color: regl.texture({
          width: texture.width,
          height: texture.height,
          stencil: false,
          format: 'rgba',
          type: 'float',
          depth: false,
          wrap: 'clamp',
          mag: 'nearest',
          min: 'nearest'
        }),
        stencil: false,
        depth: false,
        depthStencil: false,
        wrap: 'clamp',
        mag: 'nearest',
        min: 'nearest'
      });
    });

    // use one FBO for the output.
    let outFbo = fbos.pop();

    // and another for the input, for later use.
    let inFbo = fbos.pop();

    
    gaussian.blur.gaussian.compute({regl, texture, radius: 1, fbos, outFbo: outFbo, components: 'rgb', type: 'vec3'});


    let upscaledCellWidth = 16;
    let upscaledCellHeight = 16;
    let upscaledWidth = texture.width * Math.max(upscaledCellWidth, upscaledCellHeight);
    let upscaledHeight = texture.height * Math.max(upscaledCellWidth, upscaledCellHeight);

    // a command to take an input texture and "numerify" it and place it in a destination FBO.
    const drawNumbersToFbo = regl({
      frag: numerify.makeFrag({ multiplier: 256.0,
                                sourceSize: `vec2(${texture.width}, ${texture.height})`,
                                destinationCellSize: `vec2(${upscaledCellWidth - 1}, ${upscaledCellHeight - 1})`,
                                destinationSize: `vec2(${upscaledWidth}, ${upscaledHeight})`,
                                component: 'r'}),
      vert: numerify.makeVert(),
      attributes: {
        a_position: quad.verts,
        a_uv: quad.uvs
      },
      elements: quad.indices,
      uniforms: {
        digits_texture: digitsTexture,
        source_texture: regl.prop('texture'),
        u_clip_y: 1
      },
      framebuffer: regl.prop('fbo')
    });

    // allocate two FBOS to store the numerified textures.
    let numbersFBOs = [null, null].map(function () {
      return regl.framebuffer({
        color: regl.texture({
          width: upscaledWidth,
          height: upscaledHeight,
          stencil: false,
          format: 'rgba',
          type: 'uint8',
          depth: false,
          wrap: 'clamp',
          mag: 'nearest',
          min: 'nearest'
        })
      });
    });

    // one FBO to store the input texture as a numerified texture.
    let inNumbersFBO = numbersFBOs[0];
    // and a second FBO to store the blurred result texture as a numerified texture.
    // let outNumbersFBO = numbersFBOs[1];

    // copy the input texture to the `inFbo`.
    drawTextureToFbo({texture, fbo: inFbo});
    // "numerify" the input texture.
    // drawNumbersToFbo({texture: inFbo.color[0], fbo: inNumbersFBO});
    // "numerify" the blurred result texture.
    // drawNumbersToFbo({texture: outFbo.color[0], fbo: outNumbersFBO});

    // draw the stuff to img tags, and put everything into the DOM for display.

    let $srcDiv = $('<div class="source-images"></div>').css('text-align', 'center').appendTo('body');
    $('<h3>').appendTo($srcDiv).css('text-align', 'center').text('Source image (upscaled)');

    let $resultDiv = $('<div class="result-images"></div>').css('text-align', 'center').appendTo('body');
    $('<h3>').appendTo($resultDiv).css('text-align', 'center').text('Result image (upscaled)');

    function figureTemplate ({src, captionHtml = '', alt = ''}) {
      return `
      <figure>
        <img src="${src}" alt="${alt}">
        <figcaption>${captionHtml}</figcaption>
      </figure>
      `;
    }

    upscaledWidth = texture.width;
    upscaledHeight = texture.height;

    let $srcImg = $.parseHTML(figureTemplate({src: dataURIFromFBO({fbo: inFbo, width: upscaledWidth, height: upscaledHeight, regl}),
                                               alt: 'Source image (Rescaled)',
                                               captionHtml: '<strong>Source image (Rescaled)</strong>'}));
    // let $srcNumbersImg = $.parseHTML(figureTemplate({src: dataURIFromFBO({fbo: inNumbersFBO, width: upscaledWidth, height: upscaledHeight, regl}),
    //                                                   alt: 'Source image numerified red',
    //                                                   captionHtml: '<strong>Source image, numerified red</strong>'}));
    let $resultImg = $.parseHTML(figureTemplate({src: dataURIFromFBO({fbo: outFbo, width: upscaledWidth, height: upscaledHeight, regl}),
                                               alt: 'Result blurred image (Rescaled)',
                                               captionHtml: '<strong>Result blurred image (Rescaled)</strong>'}));
    // let $resultNumbersImg = $.parseHTML(figureTemplate({src: dataURIFromFBO({fbo: outNumbersFBO, width: upscaledWidth, height: upscaledHeight, regl}),
    //                                                   alt: 'Result blurred image numerified red',
    //                                                   captionHtml: '<strong>Result blurred image, numerified red</strong>'}));

    $($srcImg).css('display', 'inline-block').appendTo($srcDiv);
    // $($srcNumbersImg).css('display', 'inline-block').appendTo($srcDiv);
    $($resultImg).css('display', 'inline-block').appendTo($resultDiv);
    // $($resultNumbersImg).css('display', 'inline-block').appendTo($resultDiv);
  }
});
