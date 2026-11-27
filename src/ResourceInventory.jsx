import { useMemo, useRef, useState } from 'react';
import styles from '../styles/Home.module.css';

const PAGE_SIZE = 50;
const columns = [['name', 'Resource'], ['type', 'Type'], ['region', 'Region']];
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export default function ResourceInventory({ rows, selectedId, onSelect }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState({ key: 'name', descending: false });
  const scrollRef = useRef(null);
  const sortedRows = useMemo(() => rows.slice().sort((a, b) => {
    const order = collator.compare(a[sort.key] || 'Unknown', b[sort.key] || 'Unknown');
    return (sort.descending ? -order : order) || collator.compare(a.name, b.name) || a.graphId.localeCompare(b.graphId);
  }), [rows, sort]);
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  const goToPage = (pageIndex) => {
    setPage(pageIndex);
    scrollRef.current.scrollTop = 0;
  };
  return <div className={styles.inventoryView}>
    <div ref={scrollRef} className={styles.inventoryScroll} role="region" aria-label="Resource inventory table" tabIndex={0}>
      <table className={styles.inventoryTable}>
        <thead><tr>{columns.map(([key, label]) => <th scope="col" key={key}
          aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : undefined}>
          <button type="button" className={styles.sortHeader} onClick={() => {
            setSort({ key, descending: key === sort.key && !sort.descending });
            goToPage(0);
          }}>{label}<span aria-hidden="true">{sort.key === key ? (sort.descending ? '↓' : '↑') : '↕'}</span></button>
        </th>)}</tr></thead>
        <tbody>{sortedRows.slice(start, start + PAGE_SIZE).map((row) => <tr key={row.graphId} data-selected={selectedId === row.graphId}>
          <th scope="row"><button type="button" className={styles.inventoryResource} onClick={() => onSelect(row)} aria-current={selectedId === row.graphId ? 'true' : undefined} title={row.name}>
            <strong>{row.name}</strong>{row.id !== row.name ? <small>{row.id}</small> : null}
          </button></th>
          <td><span className={styles.inventoryType}><i style={{ backgroundColor: row.color }} />{row.type}</span></td>
          <td>{row.region || 'Unknown'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {pageCount > 1 ? <div className={styles.inventoryPagination}>
      <span role="status">{start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}</span>
      <button type="button" className={styles.secondaryBtn} disabled={!currentPage} onClick={() => goToPage(currentPage - 1)}>Previous</button>
      <button type="button" className={styles.secondaryBtn} disabled={currentPage === pageCount - 1} onClick={() => goToPage(currentPage + 1)}>Next</button>
    </div> : null}
  </div>;
}
