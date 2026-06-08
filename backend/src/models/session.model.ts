import mongoose, { Document, Schema } from "mongoose";

export interface SessionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  slugId: string;
  title: string | null;
  boxId: string;
  repoUrl: string;
  repoName: string;
  defaultBranch: string;
  branchName: string | null;
  repoInitializedAt: Date | null;
  workspaceType: 'github' | 'local';
  localPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<SessionDocument>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title:{
   type:String,
    default: null
  },
  slugId:{
    type:String,
    required: true,
    unique: true,
  },
   boxId: {
      type: String,
      required: true,
    },
    repoUrl: {
      type: String,
      required: true,
    },
    repoName: {
      type: String,
      required: true,
    },
     defaultBranch: {
      type: String,
      required: true,
    },
    branchName: {
      type: String,
      default: null,
    },
    repoInitializedAt: {
      type: Date,
      default: null,
    },
    workspaceType: {
      type: String,
      enum: ['github', 'local'],
      default: 'github',
    },
    localPath: {
      type: String,
      default: null,
    },
},{
    timestamps: true
}); 

const SessionModel = mongoose.model<SessionDocument>("Session", sessionSchema)
export default SessionModel;