import {defineConfig,devices} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {requireDisposableBrowserDatabase} from '../../scripts/fullstack-safety.mjs';
requireDisposableBrowserDatabase();
export default defineConfig({
  testDir:'./e2e/fullstack',fullyParallel:false,workers:1,retries:0,
  timeout:90000,expect:{timeout:15000},reporter:[['list']],outputDir:'test-results-fullstack',
  use:{baseURL:'http://127.0.0.1:3200',trace:'retain-on-failure',screenshot:'only-on-failure',
    launchOptions:process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer','--disable-gpu-compositing','--use-gl=disabled','--no-zygote']}:{}},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
    {name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
  webServer:[
    {command:'npm --workspace ../api run start',url:'http://127.0.0.1:3021/api/v1/health',
      reuseExistingServer:false,timeout:60000,env:{NODE_ENV:'test',PORT:'3021',WEB_ORIGIN:'http://127.0.0.1:3200',
        JWT_SECRET:randomBytes(48).toString('hex'),AUTH_ABUSE_KEY:randomBytes(48).toString('hex')}},
    {command:'npm run dev -- --port 3200',url:'http://127.0.0.1:3200',reuseExistingServer:false,timeout:120000,
      env:{NODE_ENV:'development',WEB_PUBLIC_ORIGIN:'http://127.0.0.1:3200',
        WRITING_API_URL:'http://127.0.0.1:3021/api/v1',NEXT_TELEMETRY_DISABLED:'1'}}],
});
