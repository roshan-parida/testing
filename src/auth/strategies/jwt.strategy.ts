import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
	sub: string;
	email: string;
	role: string;
	assignedStores?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private readonly configService: ConfigService,
		private readonly usersService: UsersService,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.get<string>('JWT_SECRET') || '',
		});
	}

	async validate(payload: JwtPayload) {
		const user = await this.usersService.findById(payload.sub);

		if (!user || !user.isActive) {
			throw new UnauthorizedException('Account is inactive or deleted');
		}

		return {
			userId: user._id.toString(),
			email: user.email,
			role: user.role,
			assignedStores: (user.assignedStores || []).map((id) =>
				id.toString(),
			),
		};
	}
}
