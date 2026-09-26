import {IsArray,IsEmail,IsEnum,IsIn,IsInt,IsNotEmpty,IsObject,IsOptional,IsString,IsUUID,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
import {Language} from '@prisma/client';
export class CreateProgramDto {
  @IsString() @MinLength(2) @MaxLength(40) code!:string;
  @IsString() @MinLength(2) @MaxLength(120) name!:string;
}
export class CreateBatchDto {
  @IsUUID() programId!:string;
  @IsString() @MinLength(1) @MaxLength(120) name!:string;
}
export class CreateEnrollmentDto {
  @IsUUID() studentId!:string;
  @IsUUID() programId!:string;
  @IsUUID() batchId!:string;
}
export class CreateGuardianLinkDto {
  @IsUUID() guardianId!:string;
  @IsUUID() studentId!:string;
  @IsUUID() programId!:string;
  @IsString() @MinLength(4) @MaxLength(140) verificationReference!:string;
}
export class CreateProcessingAuthorityDto {
  @IsUUID() studentId!:string;
  @IsUUID() programId!:string;
  @IsIn(['CORE_ASSESSMENT']) purpose!:string;
  @IsString() @MinLength(4) @MaxLength(150) legalBasis!:string;
  @IsString() @MinLength(1) @MaxLength(40) policyVersion!:string;
  @IsString() @MinLength(4) @MaxLength(140) reviewReference!:string;
}
export class PublishTopicDto {
  @IsUUID() programId!:string;
  @IsString() @MinLength(3) @MaxLength(50) writingType!:string;
  @IsEnum(Language) language!:Language;
  @IsString() @MinLength(3) @MaxLength(200) title!:string;
  @IsString() @MinLength(5) @MaxLength(2000) instructions!:string;
  @IsArray() @IsString({each:true}) clues!:string[];
}
export class PublishRubricDto {
  @IsUUID() programId!:string;
  @IsString() @MinLength(3) @MaxLength(50) writingType!:string;
  @IsEnum(Language) language!:Language;
  @IsInt() @Min(1) version!:number;
  @IsString() scoreStep!:string;
  @IsString() totalMarks!:string;
  @IsArray() @IsObject({each:true}) factors!:Array<Record<string,unknown>>;
}
export class BindRubricDto {
  @IsUUID() rubricVersionId!:string;
}
export class AssignTeacherDto {
  @IsUUID() teacherId!:string;
  @IsUUID() batchId!:string;
}
