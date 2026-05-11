import admin from 'firebase-admin'
import type { DocumentData } from '@google-cloud/firestore'

import type { DocumentStore } from '../../ports/document-store.js'

function toCollectionAndDocument(path: string): { collectionPath: string; documentId: string } {
  const segments = path.split('/').filter(Boolean)

  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new Error(`Invalid document path: ${path}`)
  }

  const documentId = segments[segments.length - 1]
  if (documentId === undefined) {
    throw new Error(`Invalid document path: ${path}`)
  }

  return {
    collectionPath: segments.slice(0, -1).join('/'),
    documentId,
  }
}

export class FirestoreDocumentStore implements DocumentStore {
  async getDocument<T extends DocumentData>(path: string): Promise<T | null> {
    const { collectionPath, documentId } = toCollectionAndDocument(path)
    const snapshot = await admin.firestore().collection(collectionPath).doc(documentId).get()

    if (!snapshot.exists) {
      return null
    }

    return snapshot.data() as T
  }

  async setDocument(path: string, value: DocumentData): Promise<void> {
    const { collectionPath, documentId } = toCollectionAndDocument(path)

    await admin.firestore().collection(collectionPath).doc(documentId).set(value)
  }

  async mergeDocument(path: string, value: DocumentData): Promise<void> {
    const { collectionPath, documentId } = toCollectionAndDocument(path)

    await admin.firestore().collection(collectionPath).doc(documentId).set(value, { merge: true })
  }

  async deleteDocument(path: string): Promise<void> {
    const { collectionPath, documentId } = toCollectionAndDocument(path)

    await admin.firestore().collection(collectionPath).doc(documentId).delete()
  }

  async legacyUsernameClaimed(
    usersCollection: string,
    usernameNormalized: string
  ): Promise<boolean> {
    const owner = await this.legacyUsernameOwnerUid(usersCollection, usernameNormalized)
    return owner !== null
  }

  async legacyUsernameOwnerUid(
    usersCollection: string,
    usernameNormalized: string
  ): Promise<string | null> {
    const snap = await admin
      .firestore()
      .collection(usersCollection)
      .where('username', '==', usernameNormalized)
      .limit(1)
      .get()
    if (snap.empty) return null
    return snap.docs[0]!.id
  }

  async recursiveDeleteDocument(path: string): Promise<void> {
    const { collectionPath, documentId } = toCollectionAndDocument(path)
    const db = admin.firestore()
    const ref = db.collection(collectionPath).doc(documentId)
    await db.recursiveDelete(ref)
  }
}

export { toCollectionAndDocument }
