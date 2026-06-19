import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Dynamically grab all HTML files in root
const rootFiles = fs.readdirSync(__dirname);
const htmlFiles = rootFiles.filter(file => file.endsWith('.html'));

const inputOptions = {};
htmlFiles.forEach(file => {
  const name = file.replace('.html', '');
  inputOptions[name] = resolve(__dirname, file);
});

function copyJsAssets() {
  return {
    name: 'copy-js-assets',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
      
      const jsFiles = ['settings.js', 'ads.js', 'global-status.js', 'updater.js'];
      jsFiles.forEach(file => {
        if (fs.existsSync(file)) {
          fs.copyFileSync(file, resolve(distDir, file));
        }
      });
      
      const distJsDir = resolve(distDir, 'js');
      if (!fs.existsSync(distJsDir)) fs.mkdirSync(distJsDir);
      
      if (fs.existsSync(resolve(__dirname, 'js'))) {
          const jsDirFiles = fs.readdirSync(resolve(__dirname, 'js'));
          jsDirFiles.forEach(file => {
            if (file.endsWith('.js')) {
              fs.copyFileSync(resolve(__dirname, 'js', file), resolve(distJsDir, file));
            }
          });
      }
    }
  };
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: inputOptions
    }
  },
  plugins: [copyJsAssets()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://127.0.0.1:10000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
