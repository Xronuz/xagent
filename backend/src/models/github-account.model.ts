import mongoose, { Document, Schema } from "mongoose";

export interface GithubAccountDocument extends Document {
  userId: mongoose.Types.ObjectId;
  githubId: string;
  githubLogin: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const githubAccountSchema = new Schema<GithubAccountDocument>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // remove the "unique: true", so user can connect the same github in a different account
  githubId: { type: String, required: true, },
  githubLogin: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, default: null },
  tokenExpiresAt: { type: Date, default: null },
},{
    timestamps: true
}); 

const GithubAccount = mongoose.model<GithubAccountDocument>("GithubAccount", githubAccountSchema)
export default GithubAccount;
