DROP INDEX `vote_calculation_state_type_entity_id_unique`;--> statement-breakpoint
ALTER TABLE `vote_calculation_state` ADD `governance_component_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `vote_calculation_state_component_type_entity_id_unique` ON `vote_calculation_state` (`governance_component_address`,`type`,`entity_id`);
--> statement-breakpoint
INSERT INTO `config` (`key`, `value`)
VALUES ('vote_cache_component_backfill_required', '1')
ON CONFLICT(`key`) DO UPDATE SET `value` = excluded.`value`;
