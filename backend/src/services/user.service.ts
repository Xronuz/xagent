import UserModel from "../models/user.model";

export const findUserById = async (id: string) => {
  return UserModel.findById(id);
};

export const findUserByEmail = async (email: string) => {
  return UserModel.findOne({ email });
};

export const createUser = async (data: {
  name: string;
  email: string;
  password: string;
}) => {
  return UserModel.create(data);
};
