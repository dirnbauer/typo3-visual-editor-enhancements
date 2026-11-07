/**
 * Rows on the page found through f:mark.item markers (Frontend/collection-rows.js):
 * the pure grouping and joining functions.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {editablesByChild, groupKey, groupMarkers, joinChildren, parseItem} from '../../Resources/Public/JavaScript/Frontend/collection-rows.js';

const marker = (item, overrides = {}) => ({item, live: item.split(':')[1], collection: 'cards', parent: 'tt_content:1', hasEditable: true, hidden: false, ...overrides});

describe('collection rows', () => {
  it('groupsMarkersByCollectionAndParent', () => {
    const groups = groupMarkers([
      marker('items:2'), marker('items:3'),
      marker('rows:7', {collection: 'rows'}),
      marker('items:9', {parent: 'tt_content:5'}),
      marker('broken'), marker('items:4', {collection: ''}),
    ]);
    assert.deepEqual([...groups.keys()], [groupKey('tt_content:1', 'cards'), groupKey('tt_content:1', 'rows'), groupKey('tt_content:5', 'cards')]);
    assert.deepEqual([...groups.get('tt_content:1|cards').rows.keys()], ['items:2', 'items:3']);
    assert.deepEqual(groups.get('tt_content:1|cards').rows.get('items:3'), {item: 'items:3', live: '3', table: 'items', uid: 3, hidden: false,
      primary: marker('items:3'), markers: [marker('items:3')]});
  });

  it('picksPrimaryMarkerWhenChildRenderedTwice', () => {
    const nav = marker('items:2', {hasEditable: false, id: 'nav'});
    const panel = marker('items:2', {hasEditable: true, id: 'panel'});
    const row = groupMarkers([nav, panel]).get('tt_content:1|cards').rows.get('items:2');
    assert.equal(row.primary.id, 'panel');
    assert.equal(row.markers.length, 2);
    const onlyNav = groupMarkers([nav, {...nav, id: 'second'}]).get('tt_content:1|cards').rows.get('items:2');
    assert.equal(onlyNav.primary.id, 'nav', 'without an editable the first rendering is primary');
    assert.equal(groupMarkers([nav, {...panel, hidden: true}]).get('tt_content:1|cards').rows.get('items:2').hidden, true);
  });

  it('resolvesNestedParentFromEnclosingMarker', () => {
    // collectMarkers() sets parent to the enclosing marker's data-ve-item.
    const groups = groupMarkers([marker('items:2'), marker('subitems:40', {collection: 'nested', parent: 'items:2'})]);
    assert.ok(groups.has('items:2|nested'));
    assert.deepEqual([...groups.get('items:2|nested').rows.keys()], ['subitems:40']);
    assert.deepEqual(parseItem('items:2'), {table: 'items', uid: 2});
    assert.equal(parseItem('items:x'), null);
    assert.equal(parseItem('a b:1'), null);
  });

  it('joinsPanelChildrenByUidThenLiveUid', () => {
    const group = groupMarkers([marker('items:21', {live: '11'}), marker('items:3'), marker('other:12', {live: '12'})]).get('tt_content:1|cards');
    const joined = joinChildren(group, [
      {uid: 3, table: 'items'},
      // listed under its versioned uid, rendered under its translation's uid
      {uid: 31, table: 'items', liveUid: 11},
      // same live uid but another table never joins
      {uid: 32, table: 'items', liveUid: 12},
      {uid: 99, table: 'items'},
    ]);
    assert.deepEqual([...joined.entries()].map(([uid, row]) => [uid, row.item]), [[3, 'items:3'], [31, 'items:21']]);
    assert.equal(joinChildren(undefined, [{uid: 3, table: 'items'}]).size, 0);
  });

  it('fallsBackToEditablesWhenNoMarkers', () => {
    const editables = [{table: 'items', uid: '2', field: 'title'}, {table: 'items', uid: '2', field: 'text'}, {table: 'items', uid: 3}, {table: 'tt_content', uid: 2}];
    const byChild = editablesByChild(editables, [{uid: 2, table: 'items'}, {uid: 3, table: 'items'}, {uid: 4, table: 'items'}]);
    assert.deepEqual([...byChild.keys()], [2, 3]);
    assert.equal(byChild.get(2).length, 2);
    assert.equal(groupMarkers([]).size, 0);
  });
});
