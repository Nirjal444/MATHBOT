# Custom Avatar Instructions

To use your own avatar image:

1. Save your avatar image in this directory as `avatar.png` (or `avatar.jpg`)
2. Update the image sources in the code:

## In `index.html`, change:
```html
<img src="https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=100&h=100&fit=crop&crop=face&auto=format" alt="MathBot Avatar" class="avatar-img">
```

To:
```html
<img src="/static/avatar.png" alt="MathBot Avatar" class="avatar-img">
```

## In `app.js`, change:
```html
<img src="https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=40&h=40&fit=crop&crop=face&auto=format" alt="MathBot" class="avatar-img">
```

To:
```html
<img src="/static/avatar.png" alt="MathBot" class="avatar-img">
```

The image will be automatically cropped to a circle and scaled to fit.