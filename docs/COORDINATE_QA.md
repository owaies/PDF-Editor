# PDF coordinate regression plan

PDF editing keeps objects in document coordinates so zoom should not change their stored position.

## Test
1. Place an object at a known location.
2. Zoom in and out repeatedly.
3. Move and resize the object.
4. Export the PDF.
5. Reopen it and compare the final placement.

Repeat for text, highlight, shape, image, and drawing objects.
