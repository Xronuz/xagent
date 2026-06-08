import mongoose,{Document, Schema} from "mongoose"
import { compareHashPassword, hashPassword } from "../utils/bcrypt";

export interface UserDocument extends Document {
    name:string;
    email:string;
    password: string;
    createdAt: Date;
    updatedAt: Date;

    comparePassword(value:string): Promise<boolean>
}

const userSchema = new Schema<UserDocument>(
    {
        name:{type:String, required:true},
        email:{
            type:String,
            required:true,
            unique:true,
            lowercase:true,
            trim:true,
        },
        password:{
              type:String,
            required:true,
        }
    },
    {
        timestamps: true,
        toJSON:{
            transform: (doc, ret) => {
                if(ret){
                    delete (ret as any).password;
                }
                return ret;
            }
        }
    }
);

userSchema.pre("save", async function(next){
    if(this.password && this.isModified("password")){
        this.password = await hashPassword(this.password)
    }
})

userSchema.methods.comparePassword = async function(val:string){
    return compareHashPassword(val, this.password)
}

const UserModel = mongoose.model<UserDocument>("User", userSchema)
export default UserModel;