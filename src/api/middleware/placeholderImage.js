// src/api/middleware/placeholderImage.js
/**
 * Middleware for serving placeholder images without authentication
 */
function placeholderImageMiddleware(req, res, next) {
    // Only handle placeholder image requests
    if (!req.path.startsWith('/placeholder/')) {
      return next();
    }
    
    // Extract width and height from path
    const match = req.path.match(/^\/placeholder\/(\d+)\/(\d+)$/);
    if (!match) {
      return next();
    }
    
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);
    
    // Create an SVG with the requested dimensions
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#0F172A"/>
        <text x="${width/2}" y="${height/2}" font-family="Arial" font-size="${Math.min(width, height) * 0.1}" 
              fill="#F8FAFC" text-anchor="middle" dominant-baseline="middle">TráfegoDNS</text>
        <circle cx="${width/2}" cy="${height/2 - height*0.1}" r="${Math.min(width, height) * 0.15}" fill="#0066CC"/>
        <path d="M${width/2 - width*0.2} ${height/2 + height*0.1} L${width/2 + width*0.2} ${height/2 + height*0.1} L${width/2} ${height/2 + height*0.2} Z" fill="#00A86B"/>
      </svg>
    `;
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  }
  
  module.exports = placeholderImageMiddleware;