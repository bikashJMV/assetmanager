import AnimatedNavIcon from '../../common/AnimatedNavIcon'
import InfoHint from '../../common/InfoHint'
import { ASSET_IMPORT_MAX_ROWS, ASSET_IMPORT_TEMPLATE_HREF } from '../../../utils/assetBulkImport'

/** Quick reference for the Excel bulk-import flow, shown next to the Bulk import button. */
export function BulkImportHint() {
  return (
    <InfoHint panelTitle="Bulk import" ariaLabel="Bulk import quick reference" className="shrink-0">
      <p className="font-medium text-primary">Admin / IT Ops only.</p>
      <ul className="list-disc space-y-2 pl-4">
        <li>
          Use <span className="text-primary">.xlsx</span> or <span className="text-primary">.xls</span> with headers in
          row 1. Prefer a sheet named <span className="font-medium text-primary">Import</span>. You can upload up to{' '}
          <span className="tabular-nums text-primary">{ASSET_IMPORT_MAX_ROWS}</span> data rows.
        </li>
        <li>
          <span className="font-medium text-primary">Category:</span> each row can use{' '}
          <code className="text-[0.8rem] text-primary">category_name</code> or{' '}
          <code className="text-[0.8rem] text-primary">category_slug</code>. A category that does not exist yet is
          created automatically.
        </li>
        <li>
          <span className="font-medium text-primary">Extra columns:</span> any headers beyond the core set are saved as{' '}
          <span className="font-medium text-primary">custom fields</span> on each asset (no category-specific column
          restrictions).
        </li>
        <li>
          <span className="font-medium text-primary">Custom categories:</span> add extra values in{' '}
          <code className="text-[0.8rem] text-primary">custom_*</code> columns like{' '}
          <code className="text-[0.8rem] text-primary">custom_band</code>.
        </li>
        <li>
          <span className="font-medium text-primary">Duplicates:</span> if the same{' '}
          <code className="text-[0.8rem] text-primary">serial_number</code> appears twice in the file, the whole import
          fails before any save.
        </li>
        <li>
          Match the sample column names like{' '}
          <code className="text-[0.8rem] text-primary">manufacturer_name</code>. Asset tags are created automatically.
          Do not add assignment columns.
        </li>
      </ul>
      <div className="mt-2 border-t border-base pt-3">
        <a
          href={ASSET_IMPORT_TEMPLATE_HREF}
          download
          className="inline-flex items-center gap-2 text-sm font-medium text-accent underline decoration-accent/50 underline-offset-2 hover:decoration-accent"
        >
          <span className="inline-flex h-4 w-4 shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">
            <AnimatedNavIcon name="download" />
          </span>
          Download sample file
        </a>
      </div>
    </InfoHint>
  )
}
