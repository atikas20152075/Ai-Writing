import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'*.spec.ts',testIgnore:'**/fullstack/**',fullyParallel:false,workers:1,retries:0,
 timeout:45000,expect:{timeout:15000},reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure',screenshot:'only-on-failure',
  launchOptions:process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer','--disable-gpu-compositing','--use-gl=disabled','--no-zygote']}:{}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
  {name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:[{command:'node e2e/upstream.mjs',url:'http://127.0.0.1:3011/api/v1/health',reuseExistingServer:false,env:{WRITING_SYNTHETIC_E2E:'1'}},
  {command:'npm run dev -- --port 3100',url:'http://127.0.0.1:3100',reuseExistingServer:false,timeout:120000,
   env:{WEB_PUBLIC_ORIGIN:'http://127.0.0.1:3100',WRITING_API_URL:'http://127.0.0.1:3011/api/v1',NEXT_TELEMETRY_DISABLED:'1'}}]});
