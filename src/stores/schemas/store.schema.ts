import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Store extends Document {
	@Prop({ required: true, unique: true })
	name: string;

	@Prop({ required: true })
	shopifyToken: string;

	@Prop({ required: true })
	shopifyStoreUrl: string;

	@Prop({ required: true })
	fbAdSpendToken: string;

	@Prop({ required: true })
	fbAccountId: string;

	// Google Ads OAuth fields
	@Prop({ required: false })
	googleAccessToken?: string;

	@Prop({ required: false })
	googleRefreshToken?: string;

	@Prop({ required: false })
	googleCustomerId?: string;

	@Prop({ required: false, type: Date })
	googleTokenExpiry?: Date;

	createdAt: Date;
	updatedAt: Date;
}

export const StoreSchema = SchemaFactory.createForClass(Store);
