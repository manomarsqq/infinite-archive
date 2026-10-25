// VITE_BASE is the url prefix the site is served from: "/" locally, "/<repo>/" on a GitHub Pages project site
module.exports = {
  root: 'src',
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  }
}
