/** Sanitized HTTP mapping: never echo untrusted essays, quotes or internal assessment sources. */
import {ArgumentsHost,Catch,ExceptionFilter} from '@nestjs/common';
import type {Response} from 'express';
import {DomainValidationError} from '../../../../packages/domain/src/index.ts';
import {ReviewPolicyError} from './review-policy.ts';
@Catch(ReviewPolicyError,DomainValidationError)
export class ReviewErrorFilter implements ExceptionFilter {
  catch(exception:ReviewPolicyError|DomainValidationError,host:ArgumentsHost){
    const code=exception.code;
    const status=code==='REVIEW_TWO_PERSON_REQUIRED'||code==='REVIEW_APPROVER_SCOPE_REVOKED'?403:
      code==='REVIEW_STALE_EFFECTIVE_SCORE'||code==='REVIEW_PROPOSAL_REQUIRED'||
        code==='REVIEW_UPHOLD_NOT_ALLOWED'||code==='ASSESSMENT_NOT_ELIGIBLE_FOR_REVIEW'?409:400;
    const response=host.switchToHttp().getResponse<Response>();
    response.status(status).json({statusCode:status,code,message:'Review request could not be accepted'});
  }
}
