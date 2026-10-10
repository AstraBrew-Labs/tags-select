ALTER TABLE "novelai_tags"."AdultCodexEntry"
    ADD CONSTRAINT "AdultCodexEntry_volumeId_fkey"
    FOREIGN KEY ("volumeId") REFERENCES "novelai_tags"."AdultCodexVolume"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
