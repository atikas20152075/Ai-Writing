import {IsString,IsUUID,MaxLength,MinLength} from 'class-validator';
export class CreateTypedSubmissionDto {
  @IsUUID() programId!: string;
  @IsUUID() batchId!: string;
  @IsUUID() topicVersionId!: string;
  @IsUUID() clientRequestId!: string;
  @IsString() @MinLength(10) @MaxLength(24000) text!: string;
}
export class CreateRewriteSubmissionDto {
  @IsUUID() sourceAssessmentId!: string;
  @IsUUID() expectedRevisionId!: string;
  @IsUUID() clientRequestId!: string;
  @IsString() @MinLength(10) @MaxLength(24000) text!: string;
  @IsString() @MinLength(20) @MaxLength(2000) correctionNote!: string;
}
