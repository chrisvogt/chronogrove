import { FieldValue, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore'
import admin from 'firebase-admin'

import {
  TENANT_HOSTS_COLLECTION,
  TENANT_USERNAMES_COLLECTION,
  USER_INTEGRATIONS_SEGMENT,
} from '../config/future-tenant-collections.js'
import { readStoredTenantHostnameFromUserDoc } from '../utils/read-stored-tenant-hostname.js'
import {
  buildClientPayloadFromFirestore,
  type OnboardingProgressPayload,
  type UserOnboardingDoc,
} from '../app/onboarding-progress.js'

export async function loadOnboardingStateForApi(params: {
  usersCollection: string
  uid: string
  userDoc: Record<string, unknown> | null
}): Promise<OnboardingProgressPayload> {
  const snap = await admin
    .firestore()
    .collection(params.usersCollection)
    .doc(params.uid)
    .collection(USER_INTEGRATIONS_SEGMENT)
    .get()

  const integrationProviderIds = snap.docs.map((d) => d.id)
  const integrationStatuses: Record<string, string> = {}
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    const st = data.status
    integrationStatuses[d.id] =
      typeof st === 'string' && st.length > 0 ? st : 'unknown'
  }

  return buildClientPayloadFromFirestore({
    userDoc: params.userDoc,
    integrationProviderIds,
    integrationStatuses,
  })
}

async function syncIntegrationStubs(
  usersCollection: string,
  uid: string,
  desiredProviderIds: string[]
): Promise<void> {
  const db = admin.firestore()
  const intCol = db
    .collection(usersCollection)
    .doc(uid)
    .collection(USER_INTEGRATIONS_SEGMENT)

  const existing = await intCol.get()
  const desiredSet = new Set(desiredProviderIds)
  const existingIds = new Set(existing.docs.map((d) => d.id))

  const toDelete = existing.docs.filter((d) => !desiredSet.has(d.id))
  const toCreate = desiredProviderIds.filter((id) => !existingIds.has(id))

  const CHUNK = 400
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const b = db.batch()
    for (const d of toDelete.slice(i, i + CHUNK)) {
      b.delete(d.ref)
    }
    await b.commit()
  }
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const b = db.batch()
    for (const id of toCreate.slice(i, i + CHUNK)) {
      b.set(
        intCol.doc(id),
        {
          providerId: id,
          status: 'pending_oauth',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }
    await b.commit()
  }
}

function onboardingDocFromPayload(onboarding: UserOnboardingDoc): Record<string, unknown> {
  return {
    currentStep: onboarding.currentStep,
    completedSteps: onboarding.completedSteps,
    updatedAt: onboarding.updatedAt,
    /** Legacy key removed — hostname lives in `tenantHostname` + `tenant_hosts`. */
    draftCustomDomain: FieldValue.delete(),
  }
}

function isCustomDomainEntitled(entitlementsRaw: unknown): boolean {
  return !(
    entitlementsRaw &&
    typeof entitlementsRaw === 'object' &&
    !Array.isArray(entitlementsRaw) &&
    (entitlementsRaw as Record<string, unknown>).customDomain === false
  )
}

type TenantClaimSnapshots = {
  oldUsernameSnap: DocumentSnapshot | null
  newUsernameSnap: DocumentSnapshot | null
  oldHostSnap: DocumentSnapshot | null
  newHostSnap: DocumentSnapshot | null
}

async function readTenantClaimSnapshots(
  tx: Transaction,
  db: Firestore,
  usernamePrev: string | null,
  usernameNext: string | undefined,
  domainPrev: string | null,
  domainNext: string | undefined,
): Promise<TenantClaimSnapshots> {
  let oldUsernameSnap: DocumentSnapshot | null = null
  let newUsernameSnap: DocumentSnapshot | null = null
  let oldHostSnap: DocumentSnapshot | null = null
  let newHostSnap: DocumentSnapshot | null = null

  if (usernameNext !== usernamePrev) {
    if (usernamePrev) {
      oldUsernameSnap = await tx.get(
        db.collection(TENANT_USERNAMES_COLLECTION).doc(usernamePrev),
      )
    }
    if (usernameNext) {
      newUsernameSnap = await tx.get(
        db.collection(TENANT_USERNAMES_COLLECTION).doc(usernameNext),
      )
    }
  }

  if (domainNext !== domainPrev) {
    if (domainPrev) {
      oldHostSnap = await tx.get(db.collection(TENANT_HOSTS_COLLECTION).doc(domainPrev))
    }
    if (domainNext) {
      newHostSnap = await tx.get(db.collection(TENANT_HOSTS_COLLECTION).doc(domainNext))
    }
  }

  return { oldUsernameSnap, newUsernameSnap, oldHostSnap, newHostSnap }
}

function applyUsernameClaimSideEffects(
  tx: Transaction,
  uid: string,
  usernamePrev: string | null,
  usernameNext: string | undefined,
  snaps: Pick<TenantClaimSnapshots, 'oldUsernameSnap' | 'newUsernameSnap'>,
): void {
  if (usernameNext === usernamePrev) return

  if (usernamePrev && snaps.oldUsernameSnap) {
    if (snaps.oldUsernameSnap.exists && snaps.oldUsernameSnap.get('uid') === uid) {
      tx.delete(snaps.oldUsernameSnap.ref)
    }
  }
  if (usernameNext && snaps.newUsernameSnap) {
    if (snaps.newUsernameSnap.exists) {
      const owner = snaps.newUsernameSnap.get('uid')
      if (owner !== uid) {
        throw new Error('username_taken')
      }
    }
    tx.set(snaps.newUsernameSnap.ref, {
      uid,
      claimedAt: FieldValue.serverTimestamp(),
    })
  }
}

function applyHostnameClaimSideEffects(
  tx: Transaction,
  uid: string,
  domainPrev: string | null,
  domainNext: string | undefined,
  snaps: Pick<TenantClaimSnapshots, 'oldHostSnap' | 'newHostSnap'>,
): void {
  if (domainNext === domainPrev) return

  if (domainPrev && snaps.oldHostSnap) {
    if (snaps.oldHostSnap.exists && snaps.oldHostSnap.get('uid') === uid) {
      tx.delete(snaps.oldHostSnap.ref)
    }
  }
  if (domainNext && snaps.newHostSnap) {
    if (snaps.newHostSnap.exists) {
      const owner = snaps.newHostSnap.get('uid')
      if (owner !== uid) {
        throw new Error('hostname_taken')
      }
    }
    tx.set(snaps.newHostSnap.ref, {
      uid,
      claimedAt: FieldValue.serverTimestamp(),
    })
  }
}

/**
 * Persist parsed onboarding PUT into first-class Firestore fields:
 * `username`, `tenantHostname`, `tenant_hosts/{hostname}`, `tenant_usernames/{slug}`, `onboarding`,
 * `integrations/*`, clear legacy `onboardingProgress`.
 */
export async function persistOnboardingWizardState(params: {
  usersCollection: string
  uid: string
  parsed: OnboardingProgressPayload
}): Promise<void> {
  const db = admin.firestore()
  const userRef = db.collection(params.usersCollection).doc(params.uid)
  const usernameNext = params.parsed.username
  const t = params.parsed.updatedAt

  const onboardingDoc: UserOnboardingDoc = {
    currentStep: params.parsed.currentStep,
    completedSteps: params.parsed.completedSteps,
    updatedAt: t,
  }

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    const existing = userSnap.exists
      ? (userSnap.data() as Record<string, unknown>)
      : {}

    const usernamePrev =
      typeof existing.username === 'string' && existing.username.length > 0
        ? existing.username.toLowerCase()
        : null

    const domainNext = params.parsed.customDomain
    const domainPrev = readStoredTenantHostnameFromUserDoc(existing)

    const entitlementsRaw = existing.entitlements
    if (domainNext && !isCustomDomainEntitled(entitlementsRaw)) {
      throw new Error('custom_domain_not_entitled')
    }

    /**
     * Firestore requires every tx.get before any tx.set/delete/update.
     * We used to read the new username/host claim after deleting the old one, which
     * fails when both change in one request.
     */
    const snaps = await readTenantClaimSnapshots(
      tx,
      db,
      usernamePrev,
      usernameNext,
      domainPrev,
      domainNext,
    )

    applyUsernameClaimSideEffects(tx, params.uid, usernamePrev, usernameNext, snaps)
    applyHostnameClaimSideEffects(tx, params.uid, domainPrev, domainNext, snaps)

    const userPatch: Record<string, unknown> = {
      onboarding: onboardingDocFromPayload(onboardingDoc),
      onboardingProgress: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (usernameNext) {
      userPatch.username = usernameNext
    } else if (usernamePrev && !usernameNext) {
      userPatch.username = FieldValue.delete()
    }

    if (domainNext) {
      userPatch.tenantHostname = domainNext
    } else if (domainPrev) {
      userPatch.tenantHostname = FieldValue.delete()
    }

    tx.set(userRef, userPatch, { merge: true })
  })

  await syncIntegrationStubs(
    params.usersCollection,
    params.uid,
    params.parsed.connectedProviderIds
  )
}
