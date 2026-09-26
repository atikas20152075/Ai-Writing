import {IsArray,IsIn,IsOptional,IsString,MaxLength,MinLength} from 'class-validator';
import type {FactorProposal} from '../../../../packages/domain/src/index.ts';
export class OpenReviewDto {
  @IsString() @MinLength(20) @MaxLength(2000) reason!:string;
}
export class ProposeCorrectionDto {
  @IsArray() factorResults!:FactorProposal[];
  @IsString() @MinLength(20) @MaxLength(2000) reason!:string;
}
export class DecideReviewDto {
  @IsIn(['APPROVE','REJECT','UPHOLD']) decision!:'APPROVE'|'REJECT'|'UPHOLD';
  @IsString() @MinLength(20) @MaxLength(2000) reason!:string;
}
