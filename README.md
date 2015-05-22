# Poisson Image Editing
## [View it online] (http://nn8az.github.io/)
![Image of the app](/readme/demo-small.png)

*Flickr image credit: [budellison] (https://www.flickr.com/photos/budellison/16148553787)*

An online client-side application that allows user to perform seamless copy-and-paste. The content that is being copied over adjusts its color to match against the new background.  The project is written primarily in JavaScript, utilizing Fabric.js for canvas interactivity (scaling, rotating images etc.).  A detailed description of the effect implemented in this project can be found [in this paper] (http://www.cs.jhu.edu/~misha/Fall07/Papers/Perez03.pdf).

### Note
If you try to run this project locally, you might run into cross-domain issues with `<canvas>` element and `file://` URLs.  One way to workaround this is to start a simple webserver.  If you have python installed, you can go into the project directory and run `python -m SimpleHTTPServer` then go to `http://localhost:8000`.
