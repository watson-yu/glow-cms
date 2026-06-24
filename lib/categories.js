// Pure helpers for the external-category sync (no DB), so the local-id mapping
// and its overflow guards are unit-testable independently of MySQL.

// Max value of a signed MySQL INT column. Writing a larger value silently
// clamps/wraps, which would corrupt the L2 id mapping.
export const MYSQL_INT_MAX = 2147483647;

// External L2 treatments are keyed locally as parent_id * MULTIPLIER + id so a
// child category's local id encodes its parent. The multiplier bounds how many
// treatments can share a parent before colliding into the next parent's range.
export const L2_ID_MULTIPLIER = 100000;

// Compute the local categories.id for an external L2 treatment from its parent
// category id and its own id. Guards against:
//   (a) treatment ids >= the multiplier, which would collide with a sibling
//       parent's range (e.g. parent 1 / treatment 100000 == parent 2 / 0); and
//   (b) results that overflow MySQL's signed INT (parent_id >= ~21475), which
//       MySQL silently clamps — corrupting the mapping rather than erroring.
// Throws a descriptive error instead of producing a corrupt key; the caller
// runs inside a transaction, so the throw rolls the whole sync back.
export function categoryLocalId(parentId, id) {
  if (!Number.isInteger(parentId) || !Number.isInteger(id) || parentId < 0 || id < 0) {
    throw new Error(`Invalid category ids: parent_id=${parentId}, id=${id}`);
  }
  if (id >= L2_ID_MULTIPLIER) {
    throw new Error(
      `Treatment id ${id} >= ${L2_ID_MULTIPLIER}; would collide with a sibling parent's id range`
    );
  }
  const localId = parentId * L2_ID_MULTIPLIER + id;
  if (localId > MYSQL_INT_MAX) {
    throw new Error(
      `Local category id ${localId} (parent_id=${parentId}, id=${id}) exceeds MySQL INT max ${MYSQL_INT_MAX}`
    );
  }
  return localId;
}
