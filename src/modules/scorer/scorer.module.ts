import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScorerController } from './scorer.controller';
import { ScorerService } from './scorer.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CricketModule } from '../cricket/cricket.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    forwardRef(() => CricketModule),
  ],
  controllers: [ScorerController],
  providers: [ScorerService],
  exports: [ScorerService],
})
export class ScorerModule {}







