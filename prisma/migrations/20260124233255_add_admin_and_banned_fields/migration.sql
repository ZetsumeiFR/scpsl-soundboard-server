-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "steam_id_64" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar_url" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sounds" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "filename" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "size" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_steam_id_64_key" ON "users"("steam_id_64");

-- CreateIndex
CREATE UNIQUE INDEX "sounds_filename_key" ON "sounds"("filename");

-- CreateIndex
CREATE INDEX "sounds_user_id_idx" ON "sounds"("user_id");

-- AddForeignKey
ALTER TABLE "sounds" ADD CONSTRAINT "sounds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
