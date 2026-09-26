import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {ValidationPipe} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import {AppModule} from './app.module.ts';

function validateEnvironment():void {
  for(const key of ['DATABASE_URL','JWT_SECRET','WEB_ORIGIN','AUTH_ABUSE_KEY']) if(!process.env[key]) throw Error(`${key} required`);
  if((process.env.JWT_SECRET?.length??0)<48) throw Error('JWT_SECRET must contain >=48 characters');
  if((process.env.AUTH_ABUSE_KEY?.length??0)<48) throw Error('AUTH_ABUSE_KEY must contain >=48 characters');
  if(process.env.NODE_ENV==='production' && !process.env.WEB_ORIGIN?.startsWith('https://'))
    throw Error('Production WEB_ORIGIN must use HTTPS');
}
async function bootstrap(){
  validateEnvironment();
  const app=await NestFactory.create(AppModule,{rawBody:false});
  // Never trust arbitrary client-provided X-Forwarded-For. Configure *specific* ingress CIDRs only.
  if(process.env.TRUSTED_PROXY_CIDRS) app.getHttpAdapter().getInstance().set('trust proxy',process.env.TRUSTED_PROXY_CIDRS.split(',').map(x=>x.trim()).filter(Boolean));
  app.use(cookieParser());
  app.enableCors({origin:process.env.WEB_ORIGIN,credentials:true});
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true,validationError:{target:false,value:false}}));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT??3001),'0.0.0.0');
}
bootstrap().catch(e=>{console.error('API failed to start:',e.message);process.exit(1);});
