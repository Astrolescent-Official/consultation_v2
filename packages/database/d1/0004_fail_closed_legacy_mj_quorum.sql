-- Rows created before the candidate-list TC fields were projected inherited a
-- zero quorum, which is invalid at the API boundary. Keep those legacy rows
-- readable. The finalizer treats this sentinel as unresolved: the election
-- remains closed but non-terminal until ledger projection replaces it with the
-- snapshotted on-ledger quorum.
UPDATE `mj_election`
SET `tc_quorum_xrd` = '1000000000000000000000000000000'
WHERE `tc_quorum_xrd` = '0';
