'use strict';
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',
  testMatch:'browser-playwright.spec.js',
  timeout:30000,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?'github':'list',
  use:{baseURL:'http://127.0.0.1:4173',headless:true},
  webServer:{command:'node tools/static-server.js 4173',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:15000}
});
