import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';

export class SubmitIntelDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsInt()
  systemId?: number;
}

export class ReportWormholeDto {
  @IsInt()
  fromSystemId!: number;

  @IsInt()
  toSystemId!: number;

  @IsString()
  whType!: string;

  @IsOptional()
  @IsDateString()
  estimatedEol?: string;
}
