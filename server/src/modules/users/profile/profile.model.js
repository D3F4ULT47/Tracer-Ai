import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    skills: { type: [String], default: [] },
    education: { type: [String], default: [] },
    experience: { type: [String], default: [] },
    schemaVersion: { type: String, default: '1.0.0' },
  },
  { timestamps: true, optimisticConcurrency: true, collection: 'profiles' },
);

export const Profile = mongoose.models.Profile ?? mongoose.model('Profile', profileSchema);
