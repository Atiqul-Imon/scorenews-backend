import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScorerController } from './scorer.controller';
import { ScorerService } from './scorer.service';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [ScorerController],
  providers: [ScorerService],
  exports: [ScorerService],
})
export class ScorerModule {}






