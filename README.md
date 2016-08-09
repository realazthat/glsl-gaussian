
glsl-gaussian
---


####Feed your eyes


 Source Image |
--------------|
<img src="./assets/Storm Cell Over the Southern Appalachian Mountains-dsc_2303_0-256x256.png"/>

 Gaussian Blur with radius 1  | Gaussian Blur with radius 2 | Gaussian Blur with radius 4 |
------------------------------|-----------------------------|-----------------------------|
<img src="./assets/result-256x256x-r1.png"/>|<img src="./assets/result-256x256x-r2.png"/>|<img src="./assets/result-256x256x-r4.png"/>|

(Image credit: [Storm Cell Over the Southern Appalachian Mountains](http://www.nasa.gov/content/storm-cell-over-the-southern-appalachian-mountains),
*NASA / Stu Broce*, public domain by virtue of being created by NASA)

**Live demos:**

 branch | demo
--------|-------
master  | [glsl-gaussian-demo](https://realazthat.github.io/glsl-gaussian/master/www/glsl-gaussian-demo/index.html)
        | [glsl-gaussian-live-demo](https://realazthat.github.io/glsl-gaussian/master/www/glsl-gaussian-live-demo/index.html)
        | [glsl-gaussian-suite](https://realazthat.github.io/glsl-gaussian/master/www/glsl-gaussian-suite/glsl-gaussian-suite.html)
develop | [glsl-gaussian-demo](https://realazthat.github.io/glsl-gaussian/develop/www/glsl-gaussian-demo/index.html)
        | [glsl-gaussian-live-demo](https://realazthat.github.io/glsl-gaussian/develop/www/glsl-gaussian-live-demo/index.html)
        | [glsl-gaussian-suite](https://realazthat.github.io/glsl-gaussian/develop/www/glsl-gaussian-suite/glsl-gaussian-suite.html)


####Description

glsl-gaussian is a shader generator for WebGL, to generate a gaussian blur of an input texture. Use box-blur on summed-area-tables, to allow for gaussian filtering in constant time with respect to the kernel-radius (in english:
the kernel radius can be large or small, it won't affect the computation speed).


See `glsl-gaussian-live-demo.js`, `glsl-gaussian-demo.js` for usage.

####Dependencies

* nodejs
* browserify
* [glsl-quad](https://github.com/realazthat/glsl-quad)
* [glsl-sat](https://github.com/realazthat/glsl-sat)
* [regl](https://github.com/mikolalysenko/regl)
* [glsl-numerify](https://github.com/realazthat/glsl-numerify) (for demo)
* [resl](https://github.com/mikolalysenko/resl) (for demo)
* budo (for quick demo as an alternative to running browserify) 


####Demo

To run the demo, run:

```
    cd ./glsl-gaussian
    
    #install npm dependencies
    npm install
    
    #browser should open with the demo
    budo glsl-gaussian-demo.js --open

    #browser should open with the demo
    budo glsl-gaussian-live-demo.js --open

```



####Docs

```
const gaussian = require('./glsl-gaussian.js');
```

##### `gaussian.blur.gaussian.compute ({regl, texture, radius, fbos, currentFboIndex = 0, boxPasses = 3, outFbo = null, components = 'rgba', type = 'vec4', clipY = 1})`

* Computes the guassian blur of the given texture.
* `regl` - a regl context.
* `radius` - The radius of the gaussian blur; that is to say, the kernel window around the pixel will be of size `(2*radius+1)X(2*radius+1)`.
* `fbos` - an array with at least 2 regl FBOs, used for ping-ponging during processing; should prolly have
           a type of float (32-bit) for each channel.
* `currentFboIndex` - the regl FBO index in `fbos` array to begin at for ping-ponging. The function will begin by
                      incrementing this value and using the next FBO in the array. The function will return a value
                      in the form of `{currentFboIndex}` with the position of the last-used FBO. Defaults to `0`.
* `boxPasses` - The number of box-blur passes to use; the default is `3`, which supposedly gets an approximation
                with an accuracy of 97% (<sup>[wikipedia](https://en.wikipedia.org/wiki/Box_blur)</sup>). 
* `outFbo` - destination regl FBO. Can be null, in which case the result will be left inside the `fbos` array
             on the last ping-pong; the return value with be of the form `{currentFboIndex}` so that you
             can retrieve it. See `gaussian.blur.box.compute()` for more documentation on an alternate form
             of `outFbo` that can output to a portion of the `outFbo` via a regl `viewport`.
* `components` - a string indicating which components need to be processed and blurred; defaults to `'rgba'`.
* `type` - a glsl type in string format indicating the type that can hold the components that need to be processed; defaults to `'vec4'`.
* `clipY` - a value that represents the clipspace y multiple; a default value of `1` indicates opengl-style lower-left-corner-as-origin;
             a value of `-1` would mean a upper-left-corner-as-origin.



##### `gaussian.blur.box.shader.vert ({textureWidth, textureHeight, radius, components = 'rgba', type = 'vec4'})`

* Generate a vertex shader that computes the box blur from a Summed Area Table texture.
    Returns the vertex shader as a string.
* `textureWidth` - The width of the inputtexture.
* `textureHeight` - The height of the input texture.
* `radius` - The radius of the box blur; that is to say, the box around the pixel will be of size `(2*radius+1)X(2*radius+1)`. 
* `components` - a string indicating which components need to be processed and blurred; defaults to `'rgba'`.
* `type` - a glsl type in string format indicating the type that can hold the components that need to be processed; defaults to `'vec4'`.



##### `gaussian.blur.box.shader.frag ({textureWidth, textureHeight, radius, components = 'rgba', type = 'vec4'})`

* Generate a fragment shader that computes the box blur from a Summed Area Table texture.
    Returns the fragment shader as a string.
* See `gaussian.box.shader.vert()` for params.

##### `gaussian.blur.box.compute ({regl, src, radius, outFbo = null, components = 'rgba', type = 'vec4', clipY = 1})`

* Given an input texture, will compute the box blur.
* `regl` - a regl context.
* `src` - A dictionary of the form `{satTexture}` OR `{texture, fbos, currentFboIndex}`.
  *  In the first form, the Summed Area Table
    is provided by you, the user. No FBOs are needed, just be sure to specify the `outFbo` argument.
  * In the second form, you provide the input texture yourself (via the `texture` argument), and FBOs
    for pingponging during computation of SAT. The FBOs should be an array of at least 2. The FBOs
    should prolly be of a high precision type (such as float 32 bit). `currentFboIndex` will be
    returned in the form `{currentFboIndex}` representing the last-used FBO. If `outFbo` is not
    specified, then this FBO slot will hold the result of the blur.
* `radius` - The radius of the box blur; that is to say, the box around the pixel will be of size (2*radius+1). 
* `outFbo` - Destination regl FBO. Can be null, in which case `src.fbos` is expected to exist; the result of
             of the computation will be left inside the `src.fbos` array on the last ping-pong; the return
             value with be of the form `{currentFboIndex}` so that you can retrieve it.
             Can also be a dictionary of the form `{fbo, viewport}`, so that the output will be drawn
             to the viewport area of the `fbo`; see regl API docs for the form, but it is basically
             something like `let viewport = {x,y,width,height}`; note that the `x,y` here are
             from the bottom-left corner.
* `components` - a string indicating which components need to be processed and blurred; defaults to `'rgba'`.
* `type` - a glsl type in string format indicating the type that can hold the components that need to be processed; defaults to `'vec4'`.
* `clipY` - a value that represents the clipspace y multiple; a default value of `1` indicates opengl-style lower-left-corner-as-origin;
             a value of `-1` would mean a upper-left-corner-as-origin.


####Usage

See `glsl-gaussian-demo.js` for a full demo using [regl](https://github.com/mikolalysenko/regl)
and [resl](https://github.com/mikolalysenko/resl).

An excerpt:

```

  gaussian.blur.gaussian.compute({regl, texture, radius, fbos, outFbo, components: 'rgb', type: 'vec3'});


```


