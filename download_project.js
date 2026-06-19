const fs = require('fs');
const path = require('path');
const https = require('https');

const screens = [
  {
    name: 'ad-interstitial.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzkyNmE4MzhiMTE5NjQyYTJiMTA0MTc0NDFiYmZmOWI4EgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  },
  {
    name: 'streamvault-home-tall.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1MzkyYzcyYTYyYzYwOTI1YzRkYmJkMzIwZTViEgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  },
  {
    name: 'index.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2IzYjFiNTU5Mjc1MzQ3MTc5ZWEzNGI0NzlkZDAzZDdjEgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  },
  {
    name: 'ad-rewards-settings.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzQwYzViMjQ5OTYwMjQxYzhhZWZlZGU3NGQ0ZDY5OTViEgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  },
  {
    name: 'app-settings.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2IyZmMwN2VjOWZjMjRmNTA4MzdkZmYzMGZjYmVmY2VmEgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  },
  {
    name: 'select-quality.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzhkMGRlOThkZTdmZjQ0MGZiODQ2MjZiZWIwYjg3ZmFiEgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  },
  {
    name: 'select-quality-ad-trigger.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzM2NWNjZWJkMGJiMDQyMzg5ZDUzNWFlZWZhMzRlY2U0EgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  },
  {
    name: 'download-queue.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzdlNDUwYTRhZTk2OTQ2ZWI4M2Q2NzQ5NWE1ZWQ4ZDk0EgsSBxCS1Pb5_hIYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzQ3NTUyNTQ3NTcyNDkzNTY0Ng&filename=&opi=89354086'
  }
];

function download(url, filePath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Request Failed. Status Code: ${res.statusCode}`));
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

async function main() {
  console.log('Starting downloading screens...');
  for (const screen of screens) {
    const filePath = path.join(__dirname, screen.name);
    console.log(`Downloading ${screen.name} from URL...`);
    try {
      const content = await download(screen.url, filePath);
      // Write to file
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Successfully saved ${screen.name}`);
    } catch (err) {
      console.error(`Failed to download ${screen.name}:`, err.message);
    }
  }
  console.log('All downloads completed!');
}

main();
