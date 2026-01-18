import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { CricketModule } from '../modules/cricket/cricket.module';
import { FootballModule } from '../modules/football/football.module';

@Module({
  imports: [CricketModule, FootballModule],
  providers: [WebsocketGateway],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}

